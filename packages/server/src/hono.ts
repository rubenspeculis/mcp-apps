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
interface AssetsBinding {
  fetch: (input: Request | string) => Promise<Response>;
}

export function mountMcp<E extends Hono>(hono: E, app: McpApp, options: MountOptions = {}): E {
  const path = options.path ?? "/mcp";
  // Build the handler per request so the default html resolver can reach the
  // Worker's `ASSETS` binding (only available on the per-request context) to
  // serve large self-contained components from a static asset.
  hono.all(path, (c) => {
    const assets = (c.env as { ASSETS?: AssetsBinding } | undefined)?.ASSETS;
    const handler = createMcpHandler(app, {
      ...options,
      resolveHtml:
        options.resolveHtml ??
        (async (component, request) => {
          if (component.htmlAsset && assets) {
            const url = new URL(component.htmlAsset, request.url).toString();
            const res = await assets.fetch(new Request(url));
            if (res.ok) return await res.text();
          }
          return component.html;
        }),
    });
    return handler(c.req.raw);
  });
  return hono;
}

export { createMcpHandler, type FetchHandler, type McpHandlerOptions } from "./mcp-handler.js";
