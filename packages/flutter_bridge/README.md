# mcpapps_bridge

The Dart ↔ host bridge for Flutter MCP App components. Wraps `@mcpapps/client-core`'s
JSON-RPC lifecycle behind idiomatic Dart, via `dart:js_interop`, so a Flutter component
talks to the host through the **same bridge** the Vue renderer uses.

```dart
import 'package:mcpapps_bridge/mcpapps_bridge.dart';

void main() => runMcpApp(const WeatherApp());
```

| API | Purpose |
| --- | --- |
| `runMcpApp(widget)` | Boots the engine, wires the bridge, runs the `ui/initialize` handshake. |
| `McpApp.of(context)` | The controller: `.result`, `.colorScheme`, `.callTool(name, args)`, `.reportSize(w, h)`, `.requestDisplayMode(mode)`. |
| `McpAutoSize(child:)` | Reports scroll-content height instead of clipping at the fallback viewport height. |
| `McpAppHttpClient` | `package:http` client that proxies requests through a server tool via `callTool` — needed because inlined Flutter components render in an opaque-origin `srcdoc` iframe, where a direct cross-origin fetch does not reliably resolve. |

Full guide: [docs → Guides → Flutter components](../../docs/content/3.guides/3.flutter-renderer.md).

## Versioning

This package is **not** published to pub.dev and does not follow its own semver — it is
versioned alongside the CLI's release tag. A scaffolded app depends on it either as a
local `path:` dependency (in-repo) or a `git:` dependency pinned to `ref: v<cli-version>`
(published consumers) — see `detectBridgeDep` in `packages/cli/src/create.ts`.

Part of [**mcp-apps**](https://github.com/rubenspeculis/mcp-apps).
