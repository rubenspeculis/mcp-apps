import type { McpApp } from "@mcpapps/server";
import { mountMcp } from "@mcpapps/server/hono";
import { Hono } from "hono";
import { renderHostPage } from "./host-page.js";

export interface EmulatorOptions {
  /** Path the MCP endpoint is mounted on. Default `/mcp`. */
  mcpPath?: string;
}

/**
 * Build a Hono app that serves both the MCP endpoint and the host emulator UI.
 * The emulator drives the real `/mcp` handler, so tool calls execute the actual
 * handlers — the only thing simulated is the host chat surface.
 */
export function createEmulator(app: McpApp, options: EmulatorOptions = {}): Hono {
  const mcpPath = options.mcpPath ?? "/mcp";
  const hono = new Hono();
  mountMcp(hono, app, { path: mcpPath });
  hono.get("/", (c) => c.html(renderHostPage({ appName: app.name, mcpPath })));
  return hono;
}
