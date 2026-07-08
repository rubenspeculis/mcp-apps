# @mcpapps/example-weather-vue

A minimal Vue MCP App: a `get_weather` tool bound to a `WeatherCard.vue` component,
built with the **Vue renderer** (`@mcpapps/vite-plugin-vue`) and served over
`@mcpapps/server`. Scaffolded by `mcpapps create --renderer vue` and driven entirely
through the `mcpapps` CLI — see `mcpapps.config.ts` for the component/entry wiring.

```bash
pnpm dev          # mcpapps dev — codegen + emulator with live-reload
pnpm audit        # mcpapps audit — static + real-browser conformance checks
pnpm deploy       # mcpapps deploy — wrangler deploy
```

Full walkthrough: [docs → Examples → Weather (Vue)](../../docs/content/5.examples/1.weather-vue.md).

Part of [**mcp-apps**](https://github.com/rubenspeculis/mcp-apps).
