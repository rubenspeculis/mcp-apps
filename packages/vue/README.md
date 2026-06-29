# @mcpapps/vue

Author **MCP App** components as Vue SFCs. Hooks read the host bridge; the adapter mounts
your component inside the `ui://` iframe.

```bash
pnpm add @mcpapps/vue
```

```vue
<script setup lang="ts">
import { useToolResult, useCallTool, useTheme } from "@mcpapps/vue";

const data = useToolResult<"get_weather">();   // reactive structuredContent
const refresh = useCallTool("get_weather");     // typed tool invocation
const theme = useTheme();                        // reactive light/dark + tokens
</script>
```

Compile the SFC into a self-contained `ui://` resource with
[`@mcpapps/vite-plugin-vue`](https://github.com/rubenspeculis/mcp-apps/tree/main/packages/vite-plugin-vue).

Part of [**mcp-apps**](https://github.com/rubenspeculis/mcp-apps).
