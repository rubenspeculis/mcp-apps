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

/** Walk up from `dir` to find the @mcpapps monorepo root (pnpm-workspace.yaml). */
function findWorkspaceRoot(dir: string): string | null {
  let cur = dir;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(cur, "pnpm-workspace.yaml"))) return cur;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

/** Use `workspace:*` when scaffolding inside the @mcpapps monorepo, else a range. */
function detectDep(dir: string): string {
  return findWorkspaceRoot(dir) ? "workspace:*" : "^0.1.0";
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

/** The CLI's own published version, used to pin scaffolded git deps to a tag. */
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
