import type { CompiledComponent, McpApp } from "@mcpapps/server";
import { mountMcp } from "@mcpapps/server/hono";
import { Hono } from "hono";
import { renderHostPage } from "./host-page.js";

export interface EmulatorOptions {
  /** Path the MCP endpoint is mounted on. Default `/mcp`. */
  mcpPath?: string;
}

export interface Emulator {
  hono: Hono;
  /** Tell connected emulator pages to re-render (live-reload). */
  reload: () => void;
}

/**
 * Build the emulator: serves the MCP endpoint, the host UI, asset-bundled
 * component files (Flutter), and a live-reload SSE channel. The emulator drives
 * the real `/mcp` handler — only the host chat surface is simulated.
 */
export function createEmulator(app: McpApp, options: EmulatorOptions = {}): Emulator {
  const mcpPath = options.mcpPath ?? "/mcp";
  const hono = new Hono();
  mountMcp(hono, app, { path: mcpPath });

  const components: Record<string, { basePath: string }> = {};
  for (const component of app.resourceMap.values()) {
    if (component.basePath && component.assets) {
      components[component.uri] = { basePath: component.basePath };
      mountComponentAssets(hono, component);
    }
  }

  // Live-reload over Server-Sent Events.
  const reloadClients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const encoder = new TextEncoder();
  hono.get("/_mcpapps/reload", () => {
    let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controllerRef = controller;
        reloadClients.add(controller);
        controller.enqueue(encoder.encode(": connected\n\n"));
      },
      cancel() {
        if (controllerRef) reloadClients.delete(controllerRef);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  hono.get("/", (c) =>
    c.html(renderHostPage({ appName: app.name, mcpPath, renderer: app.renderer, components })),
  );

  return {
    hono,
    reload() {
      for (const controller of reloadClients) {
        try {
          controller.enqueue(encoder.encode("data: reload\n\n"));
        } catch {
          reloadClients.delete(controller);
        }
      }
    },
  };
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
