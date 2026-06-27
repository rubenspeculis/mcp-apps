import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { resolve } from "node:path";
import { createJiti } from "jiti";
import type { McpAppConfig } from "./config.js";

// Minimal shapes for the project-local modules we load dynamically via jiti.
type ResourceMap = Map<string, unknown>;
type LoadedApp = { name: string; renderer: string; resourceMap: ResourceMap };
type CompiledComponent = { uri: string; html: string };
type VitePlugin = {
  writeComponentsModule: (
    specs: { name: string; entry: string; uri: string; title?: string }[],
    outFile: string,
    opts: { root: string },
  ) => Promise<CompiledComponent[]>;
};
type DevPkg = {
  serveEmulator: (
    app: unknown,
    opts: { port?: number },
  ) => Promise<{ url: string; reload: () => void }>;
};

function jitiFor(cwd: string) {
  return createJiti(resolve(cwd, "_cli.js"), { interopDefault: true });
}

async function loadConfig(cwd: string, jiti: ReturnType<typeof createJiti>): Promise<McpAppConfig> {
  const mod = (await jiti.import(resolve(cwd, "mcpapps.config.ts"))) as
    | McpAppConfig
    | { default: McpAppConfig };
  return "renderer" in mod ? mod : mod.default;
}

function specsFor(cwd: string, config: McpAppConfig) {
  return (config.components ?? []).map((c) => ({
    name: c.name,
    entry: resolve(cwd, c.entry),
    uri: c.uri,
    ...(c.title ? { title: c.title } : {}),
  }));
}

function generatedPath(cwd: string, config: McpAppConfig) {
  return resolve(cwd, config.generated ?? "src/generated/components.ts");
}

/** `mcpapps dev` — codegen, serve the emulator, and live-reload on edits. */
export async function devCommand(): Promise<void> {
  const cwd = process.cwd();
  const jiti = jitiFor(cwd);
  const config = await loadConfig(cwd, jiti);

  if (config.renderer !== "vue") {
    console.error("`mcpapps dev` supports the vue renderer. For Flutter, run `pnpm start`.");
    process.exitCode = 1;
    return;
  }

  const { writeComponentsModule } = (await jiti.import("@mcpapps/vite-plugin-vue")) as VitePlugin;
  const { serveEmulator } = (await jiti.import("@mcpapps/dev")) as DevPkg;
  const specs = specsFor(cwd, config);
  const generated = generatedPath(cwd, config);

  const built = await writeComponentsModule(specs, generated, { root: cwd });
  const app = ((await jiti.import(resolve(cwd, config.app))) as { app: LoadedApp }).app;
  specs.forEach((s, i) => built[i] && app.resourceMap.set(s.uri, built[i]));

  const emulator = await serveEmulator(app, config.port ? { port: config.port } : {});
  console.log(`\n  ▸ emulator   ${emulator.url}`);
  console.log(`  ▸ mcp        ${emulator.url}/mcp`);
  console.log("\n  watching components — save to live-reload\n");

  let timer: ReturnType<typeof setTimeout> | undefined;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const fresh = await writeComponentsModule(specs, generated, { root: cwd });
        specs.forEach((s, i) => fresh[i] && app.resourceMap.set(s.uri, fresh[i]));
        emulator.reload();
        console.log("  ↻ reloaded");
      } catch (err) {
        console.error(`  ✗ rebuild failed: ${(err as Error).message}`);
      }
    }, 80);
  };
  for (const spec of specs) watch(spec.entry, rebuild);
}

/** `mcpapps serve [--stdio]` — run the MCP server (HTTP or stdio). */
export async function serveCommand(argv: string[]): Promise<void> {
  const cwd = process.cwd();
  const jiti = jitiFor(cwd);
  const config = await loadConfig(cwd, jiti);
  await codegenIfVue(cwd, jiti, config);
  const app = ((await jiti.import(resolve(cwd, config.app))) as { app: unknown }).app;

  if (argv.includes("--stdio")) {
    const { serveStdio } = (await jiti.import("@mcpapps/server/stdio")) as {
      serveStdio: (app: unknown) => unknown;
    };
    serveStdio(app);
    console.error("MCP stdio server ready");
    return;
  }

  const { mountMcp } = (await jiti.import("@mcpapps/server/hono")) as {
    mountMcp: (hono: unknown, app: unknown) => unknown;
  };
  const { Hono } = (await jiti.import("hono")) as { Hono: new () => { fetch: unknown } };
  const { serve } = (await jiti.import("@hono/node-server")) as {
    serve: (o: { fetch: unknown; port: number }, cb: (i: { port: number }) => void) => void;
  };
  const hono = new Hono();
  mountMcp(hono, app);
  const port = Number(process.env.PORT ?? 8787);
  serve({ fetch: hono.fetch, port }, (i) =>
    console.log(`MCP server http://localhost:${i.port}/mcp`),
  );
}

/** `mcpapps build` — compile components (codegen). */
export async function buildCommand(): Promise<void> {
  const cwd = process.cwd();
  const jiti = jitiFor(cwd);
  const config = await loadConfig(cwd, jiti);
  await codegenIfVue(cwd, jiti, config);
  console.log("✓ build complete");
}

/** `mcpapps deploy` — codegen then `wrangler deploy`. */
export async function deployCommand(): Promise<void> {
  const cwd = process.cwd();
  const jiti = jitiFor(cwd);
  const config = await loadConfig(cwd, jiti);
  await codegenIfVue(cwd, jiti, config);
  await new Promise<void>((res, rej) => {
    const child = spawn("wrangler", ["deploy"], { cwd, stdio: "inherit" });
    child.on("error", rej);
    child.on("exit", (code) => (code === 0 ? res() : rej(new Error(`wrangler exited (${code})`))));
  });
}

async function codegenIfVue(
  cwd: string,
  jiti: ReturnType<typeof createJiti>,
  config: McpAppConfig,
): Promise<void> {
  if (config.renderer !== "vue") return;
  const { writeComponentsModule } = (await jiti.import("@mcpapps/vite-plugin-vue")) as VitePlugin;
  await writeComponentsModule(specsFor(cwd, config), generatedPath(cwd, config), { root: cwd });
}
