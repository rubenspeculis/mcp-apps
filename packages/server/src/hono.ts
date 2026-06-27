import type { Hono } from "hono";
import type { McpApp } from "./define.js";
import { createMcpHandler, type McpHandlerOptions } from "./mcp-handler.js";

export interface MountOptions extends McpHandlerOptions {
  /** Path to mount the MCP endpoint on. Default `/mcp`. */
  path?: string;
}

/**
 * Mount an MCP app onto a Hono instance. Works identically on Cloudflare
 * Workers and Node (`@hono/node-server`) because the handler is pure Fetch API:
 *
 *   // Workers:  const hono = new Hono(); mountMcp(hono, app); export default hono;
 *   // Node:     mountMcp(hono, app); serve({ fetch: hono.fetch, port: 8787 });
 */
export function mountMcp<E extends Hono>(hono: E, app: McpApp, options: MountOptions = {}): E {
  const path = options.path ?? "/mcp";
  const handler = createMcpHandler(app, options);
  hono.all(path, (c) => handler(c.req.raw));
  return hono;
}

export { createMcpHandler, type FetchHandler, type McpHandlerOptions } from "./mcp-handler.js";
