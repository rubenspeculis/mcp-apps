# @mcpapps/dev

A local **host emulator** for MCP Apps: it renders a compiled component in a real
sandboxed iframe and speaks the exact postMessage JSON-RPC lifecycle a real host uses
(Claude/ChatGPT), so a component cannot tell the emulator apart. Includes a Node dev
server and a Cloudflare tunnel helper.

```bash
pnpm add -D @mcpapps/dev
```

```ts
import { serveEmulator, startCloudflareTunnel } from "@mcpapps/dev";

const emulator = await serveEmulator(app); // app from @mcpapps/server
console.log(emulator.url);
```

Usually driven by `mcpapps dev`. The same host surface backs `mcpapps audit --runtime`.

Part of [**mcp-apps**](https://github.com/rubenspeculis/mcp-apps).
