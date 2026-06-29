# @mcpapps/protocol

Shared types and constants for the **MCP Apps** / mcp-ui wire contract — the single
source of truth every other `@mcpapps/*` package builds on (spec `2026-01-26`).

```bash
pnpm add @mcpapps/protocol
```

```ts
import {
  PROTOCOL_VERSION,
  MCP_APP_MIME,
  type CompiledComponent,
  type McpUiResourceCsp,
} from "@mcpapps/protocol";
```

It defines the lifecycle method names (`ui/initialize`, `ui/notifications/*`), the
`_meta.ui` shape (`csp` / `permissions` / `domain` / `prefersBorder`), the
`CompiledComponent` build artifact, and the JSON-RPC message guards.

Part of [**mcp-apps**](https://github.com/rubenspeculis/mcp-apps) — build interactive
`ui://` components that hosts like Claude render in a sandboxed iframe.
