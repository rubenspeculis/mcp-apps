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

> The CLI scaffolder, typed Dart codegen, and full HMR land in later milestones.

## Renderers

Each app picks one renderer. **Vue** components are self-contained (tens of KB) and
ideal for lightweight cards. **Flutter** components are richer but multi-megabyte
(CanvasKit), so they are served as cached assets and loaded via iframe `src` rather than
inlined `srcdoc` — best for stateful/graphical UIs. Both consume the *same* host bridge,
so the server, emulator, and protocol are identical across them.

## Quick start

```bash
pnpm setup        # install + codegen
pnpm dev          # turbo dev across packages
pnpm check        # biome ci + typecheck + test (the CI gate)
```

## Status

Under active development. See `docs` / the plan for the milestone roadmap (M1 Vue vertical slice
first, then real-host hardening, then the Flutter renderer).
