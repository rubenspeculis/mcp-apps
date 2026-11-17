import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { buildProject, jitiFor, prepareProject } from "./project.js";

/** `mcpapps dev` — codegen, serve the emulator, and live-reload on edits. */
export async function devCommand(): Promise<void> {
  const cwd = process.cwd();
  const jiti = jitiFor(cwd);
  const prepared = await prepareProject(cwd, "vue");
  const { app, config } = prepared;

  const { serveEmulator } = await jiti.import<{
    serveEmulator: (
      app: unknown,
      opts: { port?: number },
    ) => Promise<{ url: string; reload: () => void }>;
  }>("@mcpapps/dev");

  const emulator = await serveEmulator(app, config?.port ? { port: config.port } : {});
  console.log(`\n  ▸ emulator   ${emulator.url}`);
  console.log(`  ▸ mcp        ${emulator.url}/mcp`);
  console.log("\n  watching components — save to live-reload\n");

  let timer: ReturnType<typeof setTimeout> | undefined;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await prepared.rebuild();
        emulator.reload();
        console.log("  ↻ reloaded");
      } catch (err) {
        console.error(`  ✗ rebuild failed: ${(err as Error).message}`);
      }
    }, 80);
  };
  for (const entry of prepared.watchPaths) watch(entry, rebuild);
}

/** `mcpapps serve [--stdio]` — run the MCP server (HTTP or stdio). */
export async function serveCommand(argv: string[]): Promise<void> {
  const cwd = process.cwd();
  const jiti = jitiFor(cwd);
  const { app } = await prepareProject(cwd);

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
  await buildProject(process.cwd());
  console.log("✓ build complete");
}

/** `mcpapps deploy` — codegen then `wrangler deploy`. */
export async function deployCommand(): Promise<void> {
  const cwd = process.cwd();
  await buildProject(cwd);
  await new Promise<void>((res, rej) => {
    const child = spawn("wrangler", ["deploy"], { cwd, stdio: "inherit" });
    child.on("error", rej);
    child.on("exit", (code) => (code === 0 ? res() : rej(new Error(`wrangler exited (${code})`))));
  });
}
