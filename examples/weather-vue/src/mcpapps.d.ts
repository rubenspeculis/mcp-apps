import type { ToolMap } from "./shared/schemas.js";

// Make `useToolResult<"get_weather">()` etc. resolve to the zod-inferred types.
declare module "@mcpapps/vue" {
  interface ToolRegistry extends ToolMap {}
}
