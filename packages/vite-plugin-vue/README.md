# @mcpapps/vite-plugin-vue

Compile a Vue SFC into a single self-contained `text/html;profile=mcp-app` resource for an
**MCP App** — Vue, your component, the client-core runtime and the adapter are all bundled
and inlined, so the output has no external dependencies.

```bash
pnpm add -D @mcpapps/vite-plugin-vue
```

```ts
import { buildVueComponent, writeComponentsModule } from "@mcpapps/vite-plugin-vue";

const component = await buildVueComponent({
  entry: "./src/components/WeatherCard.vue",
  uri: "ui://weather-app/get_weather",
  csp: { connectDomains: ["https://api.example.com"] },
});
```

Most projects use the `mcpapps` CLI, which calls `writeComponentsModule` for you.

Part of [**mcp-apps**](https://github.com/rubenspeculis/mcp-apps).
