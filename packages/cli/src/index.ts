/**
 * @mcpapps/cli — scaffold and run MCP Apps. The `create-mcpapp` and `mcpapps`
 * binaries wrap this programmatic API.
 */
export { type ComponentEntry, defineConfig, type McpAppConfig } from "./config.js";
export { type CreateOptions, type CreateResult, createApp } from "./create.js";
export { buildTemplate, type Renderer, type TemplateOptions } from "./templates.js";
