# @mcpapps

A less-opinionated, multi-renderer framework for building **MCP Apps** — interactive UIs returned
from [Model Context Protocol](https://modelcontextprotocol.io) tools and rendered inside hosts like
Claude, ChatGPT and VS Code.

It implements the MCP Apps / [mcp-ui](https://mcpui.dev) contract (a tool binds a `ui://` HTML
resource rendered in a sandboxed iframe, talking back over JSON-RPC `postMessage`), but unlike
[Skybridge](https://github.com/alpic-ai/skybridge) it is deliberately unopinionated:

- **Server on [Hono](https://hono.dev)** — runs on Node and Cloudflare Workers, not Express.
- **Pluggable renderer, chosen per app** — author components in **Vue** _or_ **Flutter**, both
  first-class.
- **End-to-end type safety** from `zod` tool schemas: inferred typed hooks in Vue, generated typed
  Dart models for Flutter.
- **Full local dev** — a host emulator, hot reload, and a public tunnel.

## Documentation

Full documentation lives in [`docs/`](./docs) — a Nuxt/Docus site deployed to Cloudflare Workers.

```bash
pnpm docs:dev      # run the docs site locally (http://localhost:7001)
pnpm docs:deploy   # build (SSG) + wrangler deploy
```

## Packages

| Package | Responsibility |
| --- | --- |
| `@mcpapps/protocol` | Pure types + constants for the MCP Apps / mcp-ui contract. Single source of truth. |
| `@mcpapps/client-core` | The renderer-agnostic in-iframe runtime: the only `postMessage` JSON-RPC peer. |
| `@mcpapps/server` | Hono-mountable MCP server: `defineApp`/`defineTool`, `ui://` resource serving. |
| `@mcpapps/vue` | Vue hooks (`useToolResult`/`useCallTool`/`useTheme`) + renderer adapter. |
| `@mcpapps/vite-plugin-vue` | Compiles a `.vue` component into a self-contained `ui://` HTML resource. |
| `@mcpapps/flutter` | Compiles a Flutter Web app into a `ui://` component (loader HTML + cached assets). |
| `mcpapps_bridge` (Dart) | Dart↔host bridge (`runMcpApp`, `McpApp.of(context)`) over client-core via js_interop. |
| `@mcpapps/dev` | Local host emulator + Cloudflare tunnel. |
| `@mcpapps/cli` | `@mcpapps/create` scaffolder + the `mcpapps` CLI. |
| `@mcpapps/typegen` | Generate typed Dart models from zod schemas (zod → JSON Schema → Dart). |

## The `mcpapps` CLI

Inside a project (with an `mcpapps.config.ts`):

```bash
mcpapps dev       # host emulator with live-reload (edit a component → it re-renders)
mcpapps serve     # MCP server over HTTP (add --stdio for the stdio transport)
mcpapps build     # compile components
mcpapps deploy    # compile + wrangler deploy
```

Live-reload re-renders the component on save and replays the last tool result, so
edits appear instantly without losing state.

## Renderers

Each app picks one renderer. **Vue** components are self-contained (tens of KB) and
ideal for lightweight cards. **Flutter** components are richer but multi-megabyte
(CanvasKit): the emulator can serve their asset bundle via iframe `src`, while deployed
hosts usually receive one inlined HTML document (often rendered with `srcdoc`). Flutter is
best for stateful/graphical UIs, and should use `McpAutoSize` for tall content plus
`callTool`/`McpAppHttpClient` for backend calls from opaque-origin iframes. Both renderers
consume the *same* host bridge, so the server, emulator, and protocol are identical across
them.

## Create a new app

```bash
pnpm create @mcpapps my-app                 # Vue (default)
pnpm create @mcpapps my-app --renderer flutter
cd my-app && pnpm install && pnpm dev
```

(or `npm create @mcpapps@latest my-app`). The scaffolder generates a complete project —
a tool with zod schemas, a component, the Hono server, a Workers entry, and the
dev emulator — wired and ready to run.

## Quick start (this repo)

```bash
pnpm setup        # install + codegen
pnpm dev          # runs the Vue example emulator -> http://localhost:5179
pnpm check        # biome ci + typecheck + test (the CI gate)
```

To run the **Flutter** example (needs Flutter — auto-detected via `FLUTTER_BIN`,
your PATH, or fvm) on `http://localhost:5189`:

```bash
pnpm dev:flutter   # alias for: pnpm --filter @mcpapps/example-weather-flutter start
pnpm dev:vue       # the Vue example explicitly (same as pnpm dev)
```

## Status

Under active development. See `docs` / the plan for the milestone roadmap (M1 Vue vertical slice
first, then real-host hardening, then the Flutter renderer).
