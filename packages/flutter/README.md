# @mcpapps/flutter

Build a Flutter Web app into a `ui://` **MCP App** component. Produces either an asset
map + `basePath` (for emulators) or a single self-contained HTML document (inlined wasm,
fonts and CanvasKit) for hosts like Claude that serve one resource with no sibling files.

```bash
pnpm add -D @mcpapps/flutter
```

```ts
import { buildFlutterComponent } from "@mcpapps/flutter";

const component = await buildFlutterComponent({
  projectDir: "./flutter",
  uri: "ui://weather-app/get_weather",
  inline: true, // fold the whole build into one HTML document
});
```

`fonts.gstatic.com` (Flutter's runtime Noto fallback) is declared in the component CSP by
default; add more origins via the `csp` option. Requires the Flutter SDK on the build host.

Part of [**mcp-apps**](https://github.com/rubenspeculis/mcp-apps).
