import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
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

  if (existsSync(dir) && (await readdir(dir)).length > 0 && !opts.force) {
    throw new Error(`Target directory is not empty: ${dir} (use --force to override)`);
  }

  const files = buildTemplate({ name, renderer, dep });
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

/** Use `workspace:*` when scaffolding inside the @mcpapps monorepo, else a range. */
function detectDep(dir: string): string {
  let cur = dir;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(cur, "pnpm-workspace.yaml"))) return "workspace:*";
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return "^0.1.0";
}
