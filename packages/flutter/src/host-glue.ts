/**
 * Source for the in-iframe glue bundled (with @mcpapps/client-core) into
 * `mcpapps-host.js`. It exposes a tiny JSON-string API on `window.mcpappsHost`
 * that the Dart side calls via js_interop — mirroring the embed-sdk pattern of a
 * JSON bridge, so the Dart <-> JS boundary stays trivially typed.
 */
export const HOST_GLUE_SOURCE = /* js */ `
import { createHostBridge } from "@mcpapps/client-core";

const bridge = createHostBridge({ availableDisplayModes: ["inline", "fullscreen"] });

// Flutter's canvas fills its host page and has no intrinsic content height, so
// we must give it a concrete viewport AND report a size to the host (whose
// iframe is otherwise flexible/0-height). Use the host's containerDimensions if
// provided, else a sensible default. Later Dart-side reportSize calls also
// update the document height so helpers such as McpAutoSize can grow the Flutter
// viewport before notifying the host.
const DEFAULT_HEIGHT = 480;

function reportViewportSize(width, height) {
  const nextWidth = Math.max(1, Math.round(Number(width) || window.innerWidth || 360));
  const nextHeight = Math.max(1, Math.round(Number(height) || DEFAULT_HEIGHT));
  document.documentElement.style.height = nextHeight + "px";
  if (document.body) document.body.style.height = nextHeight + "px";
  bridge.reportSize(nextWidth, nextHeight);
}

function applyContainerSize(ctx) {
  const dims = (ctx && ctx.containerDimensions) || {};
  const height = dims.height || dims.maxHeight || DEFAULT_HEIGHT;
  const width = dims.width || window.innerWidth || 360;
  reportViewportSize(width, height);
}

window.mcpappsHost = {
  initialize: () =>
    bridge.initialize().then((res) => {
      const ctx = (res && res.hostContext) || null;
      applyContainerSize(ctx);
      return JSON.stringify(ctx);
    }),
  reportSize: (w, h) => reportViewportSize(w, h),
  requestDisplayMode: (mode) => bridge.requestDisplayMode(mode),
  getToolResult: () =>
    JSON.stringify(bridge.getLatestToolResult()?.structuredContent ?? null),
  onToolResult: (cb) =>
    bridge.onToolResult((env) => cb(JSON.stringify(env.structuredContent ?? null))),
  getTheme: () => JSON.stringify(bridge.getTheme()),
  onTheme: (cb) => bridge.onTheme((theme) => cb(JSON.stringify(theme))),
  callTool: (name, argsJson) =>
    bridge
      .callTool(name, JSON.parse(argsJson || "{}"))
      .then((env) => JSON.stringify(env.structuredContent ?? null)),
};
`;
