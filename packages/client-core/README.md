# @mcpapps/client-core

The renderer-agnostic runtime that runs **inside** an MCP App's `ui://` iframe — the
only postMessage JSON-RPC peer in the framework. It drives the lifecycle handshake,
reports size to the host, and exposes tool input/result + theme to a renderer adapter.

```bash
pnpm add @mcpapps/client-core
```

```ts
import { mountApp, createHostBridge } from "@mcpapps/client-core";

// A renderer adapter (e.g. @mcpapps/vue) hands its mount logic to mountApp,
// which wires up the host bridge, the resize observer, and tool data.
mountApp(myAdapter);
```

For testing without a browser, `createMockTransportPair()` stands in for a real host.

Part of [**mcp-apps**](https://github.com/rubenspeculis/mcp-apps).
