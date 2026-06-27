import { serve } from "@hono/node-server";
import type { McpApp } from "@mcpapps/server";
import { createEmulator, type EmulatorOptions } from "./emulator.js";

export interface ServeEmulatorOptions extends EmulatorOptions {
  /** Port to listen on. Default 5179. */
  port?: number;
}

export interface RunningEmulator {
  url: string;
  port: number;
  close: () => Promise<void>;
  /** Tell connected emulator pages to re-render (live-reload). */
  reload: () => void;
}

/** Start the emulator + MCP server on Node and resolve once it's listening. */
export function serveEmulator(
  app: McpApp,
  options: ServeEmulatorOptions = {},
): Promise<RunningEmulator> {
  const port = options.port ?? 5179;
  const { hono, reload } = createEmulator(app, options);
  return new Promise((resolve) => {
    const server = serve({ fetch: hono.fetch, port }, (info) => {
      resolve({
        url: `http://localhost:${info.port}`,
        port: info.port,
        reload,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => res());
          }),
      });
    });
  });
}
