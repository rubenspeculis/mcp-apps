# @mcpapps/example-weather-flutter

A minimal Flutter MCP App: a `get_weather` tool bound to a Dart UI built with the
**Flutter renderer** (`@mcpapps/flutter` + `mcpapps_bridge`). Unlike the Vue example,
this project drives its own build via `tsx` scripts rather than the `mcpapps` CLI's
`dev`/`build` commands — see `src/dev.ts` (emulator) and `src/pre-deploy.ts` (inlined
production build, written as a Cloudflare static asset and served via the `ASSETS`
binding in `wrangler.jsonc`).

```bash
pnpm start        # tsx src/dev.ts — builds the Flutter web bundle, serves the emulator
pnpm audit        # mcpapps audit — static checks (run --runtime after a build for the full pass)
pnpm deploy       # tsx src/pre-deploy.ts && wrangler deploy
```

Requires the Flutter SDK (auto-detected via `FLUTTER_BIN`, `PATH`, or `fvm` — see
`flutter/.fvmrc`). Full walkthrough: [docs → Examples → Weather (Flutter)](../../docs/content/5.examples/2.weather-flutter.md).

Part of [**mcp-apps**](https://github.com/rubenspeculis/mcp-apps).
