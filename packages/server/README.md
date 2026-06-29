# @mcpapps/server

A Hono-mountable, Workers-native MCP server for **MCP Apps**. Declare tools with zod
schemas via `defineApp`/`defineTool`, bind each to a compiled `ui://` component, and
serve the MCP endpoint over HTTP or stdio.

```bash
pnpm add @mcpapps/server
```

```ts
import { defineApp, defineTool } from "@mcpapps/server";
import { mountMcp } from "@mcpapps/server/hono";
import { Hono } from "hono";
import { z } from "zod";

const greet = defineTool({
  name: "greet",
  inputSchema: z.object({ name: z.string() }),
  outputSchema: z.object({ greeting: z.string() }),
  ui: myCompiledComponent, // from @mcpapps/vite-plugin-vue or @mcpapps/flutter
  handler: ({ name }) => ({ greeting: `Hello, ${name}!` }),
});

const app = defineApp({ name: "demo", version: "1.0.0", renderer: "vue", tools: [greet] });
const hono = new Hono();
mountMcp(hono, app);
export default hono;
```

Entry points: `.` (core), `./hono` (`mountMcp`), `./stdio` (`serveStdio`).

Part of [**mcp-apps**](https://github.com/rubenspeculis/mcp-apps).
