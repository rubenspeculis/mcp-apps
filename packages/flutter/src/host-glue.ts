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
// provided, else a sensible default.
const DEFAULT_HEIGHT = 480;

function applyContainerSize(ctx) {
  const dims = (ctx && ctx.containerDimensions) || {};
  const height = dims.height || dims.maxHeight || DEFAULT_HEIGHT;
  const width = dims.width || window.innerWidth || 360;
  document.documentElement.style.height = height + "px";
  if (document.body) document.body.style.height = height + "px";
  bridge.reportSize(width, height);
}

window.mcpappsHost = {
  initialize: () =>
    bridge.initialize().then((res) => {
      const ctx = (res && res.hostContext) || null;
      applyContainerSize(ctx);
      return JSON.stringify(ctx);
    }),
  reportSize: (w, h) => bridge.reportSize(w, h),
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
