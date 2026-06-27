/**
 * Source for the in-iframe glue bundled (with @mcpapps/client-core) into
 * `mcpapps-host.js`. It exposes a tiny JSON-string API on `window.mcpappsHost`
 * that the Dart side calls via js_interop — mirroring the embed-sdk pattern of a
 * JSON bridge, so the Dart <-> JS boundary stays trivially typed.
 */
export const HOST_GLUE_SOURCE = /* js */ `
import { createHostBridge } from "@mcpapps/client-core";

const bridge = createHostBridge();

window.mcpappsHost = {
  ready: () => bridge.ready(),
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
