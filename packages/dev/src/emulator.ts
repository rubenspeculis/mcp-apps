import type { CompiledComponent, McpApp } from "@mcpapps/server";
import { mountMcp } from "@mcpapps/server/hono";
import { Hono } from "hono";
import { renderHostPage } from "./host-page.js";

export interface EmulatorOptions {
  /** Path the MCP endpoint is mounted on. Default `/mcp`. */
  mcpPath?: string;
}

/**
 * Build a Hono app that serves the MCP endpoint, the host emulator UI, and the
 * static assets of any asset-bundled (Flutter) components. The emulator drives
 * the real `/mcp` handler, so tool calls execute the actual handlers — only the
 * host chat surface is simulated.
 */
export function createEmulator(app: McpApp, options: EmulatorOptions = {}): Hono {
  const mcpPath = options.mcpPath ?? "/mcp";
  const hono = new Hono();
  mountMcp(hono, app, { path: mcpPath });

  // Serve assets for components that ship a multi-file bundle (Flutter).
  const components: Record<string, { basePath: string }> = {};
  for (const component of app.resourceMap.values()) {
    if (component.basePath && component.assets) {
      components[component.uri] = { basePath: component.basePath };
      mountComponentAssets(hono, component);
    }
  }

  hono.get("/", (c) =>
    c.html(renderHostPage({ appName: app.name, mcpPath, renderer: app.renderer, components })),
  );
  return hono;
}

function mountComponentAssets(hono: Hono, component: CompiledComponent): void {
  const base = component.basePath as string;
  const assets = component.assets as NonNullable<CompiledComponent["assets"]>;
  hono.get(`${base}*`, (c) => {
    const rest = c.req.path.slice(base.length);
    const key = rest === "" ? "index.html" : rest;
    const asset = assets[key] ?? assets["index.html"];
    if (!asset) return c.notFound();
    const immutable = key !== "index.html";
    return new Response(asset.body as BodyInit, {
      headers: {
        "Content-Type": asset.mimeType,
        "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
      },
    });
  });
}
