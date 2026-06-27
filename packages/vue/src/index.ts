/**
 * @mcpapps/vue — author MCP App components as Vue SFCs. Hooks read the host
 * bridge; the adapter mounts the component inside the `ui://` iframe.
 */

export { createVueAdapter } from "./adapter.js";
export { BridgeKey, injectBridge } from "./bridge.js";
export { useCallTool, useTheme, useToolResult } from "./hooks.js";
export type { ResolveInput, ResolveOutput, ToolRegistry } from "./registry.js";
