# @mcpapps/cli

The `mcpapps` command that runs **MCP Apps** in a project (dev/serve/build/audit/deploy).
It loads your project's `app` and its `@mcpapps/*` packages at runtime, so its own install
footprint stays small. To scaffold a new project, use
[`@mcpapps/create`](https://www.npmjs.com/package/@mcpapps/create):

```bash
# Scaffold a new project (Vue or Flutter)
pnpm create @mcpapps my-app --renderer vue
```

Inside a project:

| Command | Does |
| --- | --- |
| `mcpapps dev` | Compile components, serve the emulator, live-reload on edits. |
| `mcpapps serve [--stdio]` | Run the MCP server over HTTP (or stdio). |
| `mcpapps build` | Compile components. |
| `mcpapps audit [--static-only \| --runtime]` | Validate the app conforms to the spec. |
| `mcpapps deploy` | Compile, then `wrangler deploy`. |

`mcpapps audit` is a pre-publish conformance check: static validation plus a headless-browser
runtime pass (lifecycle handshake, non-zero size, CSP drift). The runtime layer needs
Playwright (`pnpm add -D playwright && npx playwright install chromium`).

Part of [**mcp-apps**](https://github.com/rubenspeculis/mcp-apps).
