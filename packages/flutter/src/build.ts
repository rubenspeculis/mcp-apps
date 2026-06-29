import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type {
  CompiledComponent,
  McpUiPermissions,
  McpUiResourceCsp,
  UiResourceUri,
} from "@mcpapps/protocol";
import { build as esbuild } from "esbuild";
import { HOST_GLUE_SOURCE } from "./host-glue.js";
import { inlineFlutterBuild } from "./inline.js";
import { mimeFor } from "./mime.js";
import { resolveFlutterBin } from "./resolve.js";

export interface BuildFlutterComponentOptions {
  /** Flutter project directory (contains pubspec.yaml and web/). */
  projectDir: string;
  /** The `ui://` URI this component is served at. */
  uri: UiResourceUri;
  /** Path to the flutter binary. Default `flutter` on PATH. */
  flutterBin?: string;
  /** Serve path with leading/trailing slashes. Default `/_c/<slug>/`. */
  basePath?: string;
  /** Pass `--release` (default) vs `--profile` for faster dev builds. */
  release?: boolean;
  /**
   * Load CanvasKit from the gstatic CDN instead of bundling it. Default `false`
   * — i.e. pass `--no-web-resources-cdn` so CanvasKit is served same-origin
   * from `<base-href>/canvaskit/`. The sandbox CSP (`script-src 'self'`,
   * `connect-src 'none'`) blocks the CDN, so bundling is required to render.
   */
  webResourcesCdn?: boolean;
  /** Extra args appended to `flutter build web`. */
  extraArgs?: string[];
  /** Run `flutter pub get` before building. Default true. */
  pubGet?: boolean;
  /**
   * Produce a single self-contained HTML document (all assets inlined) instead
   * of an `assets` map + `basePath`. Required for hosts (Claude) that only serve
   * a single `text/html;profile=mcp-app` resource with no sibling files.
   */
  inline?: boolean;
  /** CSP allowlists emitted into the component's `_meta.ui.csp`. */
  csp?: McpUiResourceCsp;
  /** Capability requests emitted into `_meta.ui.permissions`. */
  permissions?: McpUiPermissions;
  /** Dedicated sandbox origin, emitted into `_meta.ui.domain`. */
  domain?: string;
  /** Border preference, emitted into `_meta.ui.prefersBorder`. */
  prefersBorder?: boolean;
}

/**
 * Compile a Flutter Web app into a `ui://` MCP App component. Flutter bundles
 * are multi-megabyte and multi-file, so unlike Vue they are NOT inlined: the
 * component carries an `assets` map and a `basePath`, and the host loads it via
 * an iframe `src` (served at `basePath`) rather than `srcdoc`.
 */
export async function buildFlutterComponent(
  opts: BuildFlutterComponentOptions,
): Promise<CompiledComponent> {
  const flutterBin = opts.flutterBin ?? resolveFlutterBin(opts.projectDir);
  const basePath = opts.basePath ?? `/_c/${slug(opts.uri)}/`;

  if (opts.pubGet !== false) {
    await runFlutter(flutterBin, ["pub", "get"], opts.projectDir);
  }

  const args = ["build", "web", "--base-href", basePath];
  // Bundle CanvasKit (no gstatic CDN) so it loads same-origin under the sandbox
  // CSP. Opt back into the CDN only if explicitly requested.
  if (opts.webResourcesCdn !== true) args.push("--no-web-resources-cdn");
  args.push(opts.release === false ? "--profile" : "--release");
  if (opts.extraArgs) args.push(...opts.extraArgs);
  await runFlutter(flutterBin, args, opts.projectDir);

  const webDir = join(opts.projectDir, "build", "web");

  // Bundle the client-core glue (resolved from the Flutter project's deps).
  const glue = await bundleHostGlue(opts.projectDir);

  let component: CompiledComponent;
  if (opts.inline) {
    // Single self-contained HTML — no sibling assets, no basePath.
    const html = await inlineFlutterBuild({ webDir, hostGlue: glue });
    component = { uri: opts.uri, html };
  } else {
    const assets: NonNullable<CompiledComponent["assets"]> = {};
    for await (const file of walk(webDir)) {
      const rel = relative(webDir, file).split(sep).join("/");
      assets[rel] = { body: new Uint8Array(await readFile(file)), mimeType: mimeFor(rel) };
    }
    assets["mcpapps-host.js"] = { body: glue, mimeType: "text/javascript" };
    const indexAsset = assets["index.html"];
    const indexHtml = indexAsset ? toText(indexAsset.body) : "<!doctype html><head></head>";
    const html = injectHostScript(indexHtml);
    assets["index.html"] = { body: html, mimeType: "text/html" };
    component = { uri: opts.uri, html, assets, basePath };
  }
  component.csp = withFlutterFontCsp(opts.csp);
  if (opts.permissions) component.permissions = opts.permissions;
  if (opts.domain) component.domain = opts.domain;
  if (opts.prefersBorder !== undefined) component.prefersBorder = opts.prefersBorder;
  return component;
}

/** Origin Flutter web fetches Noto fallback fonts from at runtime. */
export const FLUTTER_FONT_CDN = "https://fonts.gstatic.com";

/**
 * Merge the Flutter runtime font origin (`fonts.gstatic.com`) into a caller's
 * CSP. Flutter web fetches Noto fallback fonts from there at runtime (for glyphs
 * outside the bundled font — symbols, emoji, CJK), so the host's CSP must permit
 * the connection. Caller-provided origins are preserved and de-duplicated.
 */
export function withFlutterFontCsp(csp?: McpUiResourceCsp): McpUiResourceCsp {
  const out: McpUiResourceCsp = { ...(csp ?? {}) };
  out.connectDomains = uniq([...(out.connectDomains ?? []), FLUTTER_FONT_CDN]);
  out.resourceDomains = uniq([...(out.resourceDomains ?? []), FLUTTER_FONT_CDN]);
  return out;
}

function uniq(items: string[]): string[] {
  return [...new Set(items)];
}

export function slug(uri: string): string {
  return (
    uri
      .replace(/^ui:\/\//, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "app"
  );
}

function injectHostScript(html: string): string {
  const tag = `  <script src="mcpapps-host.js"></script>\n`;
  if (html.includes("</head>")) return html.replace("</head>", `${tag}</head>`);
  return `${tag}${html}`;
}

async function bundleHostGlue(resolveDir: string): Promise<string> {
  const result = await esbuild({
    stdin: { contents: HOST_GLUE_SOURCE, resolveDir, loader: "js" },
    bundle: true,
    format: "iife",
    platform: "browser",
    minify: true,
    write: false,
  });
  const file = result.outputFiles[0];
  if (!file) throw new Error("Failed to bundle mcpapps host glue");
  return file.text;
}

function runFlutter(bin: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", (err) =>
      reject(new Error(`Failed to run ${bin}: ${err.message}. Is Flutter installed?`)),
    );
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`flutter ${args.join(" ")} exited (${code})`)),
    );
  });
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function toText(body: string | Uint8Array): string {
  return typeof body === "string" ? body : new TextDecoder().decode(body);
}
