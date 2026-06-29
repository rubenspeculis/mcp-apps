import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { buildTemplate, type Renderer } from "./templates.js";

export interface CreateOptions {
  /** Target directory (created if missing). */
  targetDir: string;
  /** Package name. Defaults to the target directory's basename. */
  name?: string;
  /** Renderer to scaffold. Default "vue". */
  renderer?: Renderer;
  /** Override the @mcpapps/* dependency spec. Default: auto-detected. */
  dep?: string;
  /** Override the Flutter `mcpapps_bridge` pubspec dep block. Default: auto-detected. */
  bridgeDep?: string;
  /** Allow scaffolding into a non-empty directory. */
  force?: boolean;
}

export interface CreateResult {
  dir: string;
  name: string;
  renderer: Renderer;
  files: string[];
}

/** Scaffold a new MCP App project. Returns the files written. */
export async function createApp(opts: CreateOptions): Promise<CreateResult> {
  const dir = resolve(opts.targetDir);
  const name = opts.name ?? basename(dir);
  const renderer = opts.renderer ?? "vue";
  const dep = opts.dep ?? detectDep(dir);
  const bridgeDep = opts.bridgeDep ?? detectBridgeDep(dir);

  if (existsSync(dir) && (await readdir(dir)).length > 0 && !opts.force) {
    throw new Error(`Target directory is not empty: ${dir} (use --force to override)`);
  }

  const files = buildTemplate({ name, renderer, dep, bridgeDep });
  const written: string[] = [];
  for (const [rel, raw] of Object.entries(files)) {
    const content = raw.replaceAll("APP_NAME", name);
    const full = join(dir, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
    written.push(rel);
  }
  return { dir, name, renderer, files: written.sort() };
}

/**
 * Walk up from `dir` to find the @mcpapps monorepo root. A `pnpm-workspace.yaml`
 * alone is not enough — scaffolding into *another* pnpm monorepo would otherwise
 * match the host's workspace and emit unresolvable `workspace:*` deps. We keep
 * walking past foreign workspaces and only accept this repo's root.
 */
function findWorkspaceRoot(dir: string): string | null {
  let cur = dir;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(cur, "pnpm-workspace.yaml")) && isMcpAppsRoot(cur)) return cur;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

/** True only for the @mcpapps monorepo root — guards against foreign pnpm workspaces. */
function isMcpAppsRoot(root: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { name?: string };
    return pkg.name === "mcpapps-monorepo";
  } catch {
    return false;
  }
}

/**
 * Use `workspace:*` when scaffolding inside the @mcpapps monorepo, else a caret
 * range on the CLI's own published version — so a `create-mcpapp@x.y.z` scaffolds
 * `^x.y.z` and never drifts from what's actually on npm.
 */
function detectDep(dir: string): string {
  return findWorkspaceRoot(dir) ? "workspace:*" : `^${cliVersion()}`;
}

/**
 * Resolve the Flutter `mcpapps_bridge` pubspec dep block. In-repo we use a local
 * `path:` dep (computed relative to the scaffold) so bridge edits are seen
 * immediately; published consumers get a git dep pinned to the CLI's release tag
 * (`v<version>`) so a scaffold never tracks an unstable `main`.
 */
function detectBridgeDep(dir: string): string {
  const root = findWorkspaceRoot(dir);
  if (root && existsSync(join(root, "packages/flutter_bridge/pubspec.yaml"))) {
    const rel = relative(join(dir, "flutter"), join(root, "packages/flutter_bridge")).replaceAll(
      "\\",
      "/",
    );
    return ["  mcpapps_bridge:", `    path: ${rel}`].join("\n");
  }
  return [
    "  mcpapps_bridge:",
    "    git:",
    "      url: https://github.com/rubenspeculis/mcp-apps.git",
    "      path: packages/flutter_bridge",
    `      ref: v${cliVersion()}`,
  ].join("\n");
}

/**
 * The CLI's own published version — used both for the scaffolded npm dep range
 * and to pin the Flutter bridge git dep to its `v<version>` tag. Falls back to
 * `0.1.0` for the unpublished `0.0.0` dev/bootstrap state.
 */
function cliVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version?: string;
    };
    if (pkg.version && pkg.version !== "0.0.0") return pkg.version;
  } catch {
    // fall through to the default
  }
  return "0.1.0";
}
