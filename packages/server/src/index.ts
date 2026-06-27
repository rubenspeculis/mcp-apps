/**
 * @mcpapps/server — define MCP Apps and serve them over Hono (Workers + Node).
 * The `./hono` entrypoint holds the Hono mount helpers.
 */
export {
  type AnyToolDefinition,
  type AppDefinition,
  type CompiledComponent,
  defineApp,
  defineTool,
  type InferToolMap,
  type McpApp,
  type RendererName,
  type ToolDefinition,
} from "./define.js";
export {
  createMcpHandler,
  type FetchHandler,
  type McpHandlerOptions,
  processMessage,
  SUPPORTED_PROTOCOL_VERSION,
} from "./mcp-handler.js";
