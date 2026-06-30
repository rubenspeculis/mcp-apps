export type Renderer = "vue" | "flutter";

export interface TemplateOptions {
  /** Package name, e.g. "my-mcp-app". */
  name: string;
  renderer: Renderer;
  /** Version spec for @mcpapps/* deps ("workspace:*" in-repo, else a range). */
  dep: string;
  /**
   * Pubspec dependency block for `mcpapps_bridge` (Flutter only). A local `path:`
   * dep when scaffolding in-repo, else a git dep pinned to the CLI's release tag.
   * Vue templates ignore it.
   */
  bridgeDep: string;
}

/** Build the full file map (relative path -> contents) for a new project. */
export function buildTemplate(opts: TemplateOptions): Record<string, string> {
  return opts.renderer === "flutter" ? flutterTemplate(opts) : vueTemplate(opts);
}

// Concrete third-party versions so the generated project installs anywhere
// (the monorepo `catalog:` is not resolvable outside it).
const V = {
  hono: "^4.0.0",
  nodeServer: "^1.0.0",
  zod: "4.4.3",
  vue: "^3.5.0",
  vite: "^6.0.0",
  pluginVue: "^5.2.0",
  tsx: "^4.19.0",
  typescript: "^5.7.0",
  typesNode: "^22.10.0",
  wrangler: "^4.105.0",
};

function vueTemplate({ name, dep }: TemplateOptions): Record<string, string> {
  return {
    "package.json": json({
      name,
      version: "0.0.0",
      private: true,
      type: "module",
      scripts: {
        dev: "mcpapps dev",
        serve: "mcpapps serve",
        build: "mcpapps build && tsc --noEmit",
        typecheck: "mcpapps build && tsc --noEmit",
        audit: "mcpapps audit",
        deploy: "mcpapps deploy",
      },
      dependencies: {
        "@hono/node-server": V.nodeServer,
        "@mcpapps/client-core": dep,
        "@mcpapps/protocol": dep,
        "@mcpapps/server": dep,
        "@mcpapps/vue": dep,
        hono: V.hono,
        vue: V.vue,
        zod: V.zod,
      },
      devDependencies: {
        "@mcpapps/cli": dep,
        "@mcpapps/dev": dep,
        "@mcpapps/vite-plugin-vue": dep,
        "@types/node": V.typesNode,
        "@vitejs/plugin-vue": V.pluginVue,
        typescript: V.typescript,
        vite: V.vite,
        wrangler: V.wrangler,
      },
    }),
    "tsconfig.json": json({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        lib: ["ES2023", "DOM"],
        types: ["node"],
        strict: true,
        verbatimModuleSyntax: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ["src"],
    }),
    ".gitignore": "node_modules/\ndist/\nsrc/generated/\n.wrangler/\n*.log\n",
    "wrangler.jsonc": json({
      $schema: "node_modules/wrangler/config-schema.json",
      name,
      main: "src/worker.ts",
      compatibility_date: "2025-09-01",
      compatibility_flags: ["nodejs_compat"],
    }),
    "README.md": vueReadme(name),
    "mcpapps.config.ts": MCPAPPS_CONFIG_TS,
    "src/shared/schemas.ts": VUE_SCHEMAS,
    "src/mcpapps.d.ts": MCPAPPS_DTS,
    "src/components/GreetingCard.vue": GREETING_VUE,
    "src/app.ts": APP_TS,
    "src/worker.ts": WORKER_TS,
  };
}

function flutterTemplate({ name, dep, bridgeDep }: TemplateOptions): Record<string, string> {
  return {
    "package.json": json({
      name,
      version: "0.0.0",
      private: true,
      type: "module",
      scripts: {
        start: "tsx src/dev.ts",
        build: "tsx src/codegen.ts && tsc --noEmit",
        typecheck: "tsx src/codegen.ts && tsc --noEmit",
        audit: "mcpapps audit",
        deploy: "tsx src/pre-deploy.ts && wrangler deploy",
      },
      dependencies: {
        "@hono/node-server": V.nodeServer,
        "@mcpapps/client-core": dep,
        "@mcpapps/flutter": dep,
        "@mcpapps/protocol": dep,
        "@mcpapps/server": dep,
        hono: V.hono,
        zod: V.zod,
      },
      devDependencies: {
        "@mcpapps/cli": dep,
        "@mcpapps/dev": dep,
        "@types/node": V.typesNode,
        tsx: V.tsx,
        typescript: V.typescript,
        wrangler: V.wrangler,
      },
    }),
    "tsconfig.json": json({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        lib: ["ES2023", "DOM"],
        types: ["node"],
        strict: true,
        verbatimModuleSyntax: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ["src"],
    }),
    ".gitignore":
      "node_modules/\nflutter/build/\nflutter/.dart_tool/\nsrc/generated/\ndist/\n.wrangler/\n*.log\n",
    "wrangler.jsonc": json({
      $schema: "node_modules/wrangler/config-schema.json",
      name,
      main: "src/worker.ts",
      compatibility_date: "2025-09-01",
      compatibility_flags: ["nodejs_compat"],
      // Inlined Flutter HTML (written by src/pre-deploy.ts). The ASSETS binding
      // lets the Worker read it at request time and return it from resources/read.
      assets: { directory: "dist", binding: "ASSETS" },
    }),
    "README.md": flutterReadme(name),
    "src/codegen.ts": FLUTTER_CODEGEN_TS,
    "src/dev.ts": FLUTTER_DEV_TS,
    "src/pre-deploy.ts": FLUTTER_PRE_DEPLOY_TS,
    "src/worker.ts": FLUTTER_WORKER_TS,
    "flutter/.fvmrc": '{\n  "flutter": "3.41.9"\n}\n',
    "flutter/pubspec.yaml": flutterPubspec(name, bridgeDep),
    "flutter/web/index.html": FLUTTER_INDEX_HTML,
    "flutter/lib/main.dart": FLUTTER_MAIN_DART,
  };
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

// --- shared / vue file bodies (no backticks or ${} so they embed cleanly) ---

const VUE_SCHEMAS = `import { z } from "zod";

export const greetInput = z.object({ name: z.string() });
export const greetOutput = z.object({ greeting: z.string(), emoji: z.string() });

export type ToolMap = {
  greet: { input: z.infer<typeof greetInput>; output: z.infer<typeof greetOutput> };
};
`;

const MCPAPPS_DTS = `import type { ToolMap } from "./shared/schemas.js";

declare module "@mcpapps/vue" {
  interface ToolRegistry extends ToolMap {}
}
`;

const GREETING_VUE = `<script setup lang="ts">
import { useTheme, useToolResult } from "@mcpapps/vue";

const data = useToolResult<"greet">();
const theme = useTheme();
</script>

<template>
  <div class="card" :class="theme.colorScheme">
    <p v-if="data" class="msg">{{ data.emoji }} {{ data.greeting }}</p>
    <p v-else class="muted">Waiting…</p>
  </div>
</template>

<style scoped>
.card { font: 16px/1.5 system-ui, sans-serif; padding: 24px; border-radius: 16px; background: #f6f7fb; color: #11131a; }
.card.dark { background: #1a1d29; color: #eef0f7; }
.msg { font-size: 22px; font-weight: 600; margin: 0; }
.muted { opacity: 0.6; margin: 0; }
</style>
`;

const APP_TS = `import { defineApp, defineTool } from "@mcpapps/server";
import { greetingCard } from "./generated/components.js";
import { greetInput, greetOutput } from "./shared/schemas.js";

const greet = defineTool({
  name: "greet",
  description: "Greet someone by name.",
  inputSchema: greetInput,
  outputSchema: greetOutput,
  ui: greetingCard,
  handler: ({ name }) => ({ greeting: "Hello, " + name + "!", emoji: "👋" }),
});

export const app = defineApp({
  name: "APP_NAME",
  version: "1.0.0",
  renderer: "vue",
  compat: true,
  tools: [greet],
});
`;

const MCPAPPS_CONFIG_TS = `import { defineConfig } from "@mcpapps/cli";

export default defineConfig({
  renderer: "vue",
  app: "./src/app.ts",
  generated: "./src/generated/components.ts",
  components: [
    {
      name: "greetingCard",
      entry: "./src/components/GreetingCard.vue",
      uri: "ui://APP_NAME/greet",
      title: "Greeting",
      // Declare external origins your component contacts at runtime (omit = none).
      // Emitted into the resource's _meta.ui.csp (+ openai/widgetCSP for ChatGPT).
      // csp: { connectDomains: ["https://api.example.com"], resourceDomains: ["https://cdn.example.com"] },
      // permissions: { clipboardWrite: {} },
    },
  ],
  port: 5179,
});
`;

const WORKER_TS = `import { mountMcp } from "@mcpapps/server/hono";
import { Hono } from "hono";
import { app } from "./app.js";

const hono = new Hono();
mountMcp(hono, app);

export default hono;
`;

const FLUTTER_CODEGEN_TS = `import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Generates a type stub so \`tsc --noEmit\` can resolve the import in worker.ts.
// The real file is written by pre-deploy.ts (requires a Flutter build).
const here = dirname(fileURLToPath(import.meta.url));
const metaDir = resolve(here, "generated");
await mkdir(metaDir, { recursive: true });
await writeFile(
  join(metaDir, "component-meta.ts"),
  [
    "// Auto-generated stub -- overwritten by pre-deploy.ts at deploy time",
    'export const COMPONENT_URI = "ui://APP_NAME/greet";',
    'export const COMPONENT_HTML_ASSET = "/_c/stub/index.html";',
    'export const COMPONENT_CSP = { connectDomains: ["https://fonts.gstatic.com"] };',
    "",
  ].join("\\n"),
);
`;

const FLUTTER_DEV_TS = `import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveEmulator } from "@mcpapps/dev";
import { buildFlutterComponent } from "@mcpapps/flutter";
import { defineApp, defineTool } from "@mcpapps/server";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

console.log("Building Flutter component…");
const greetingCard = await buildFlutterComponent({
  projectDir: resolve(root, "flutter"),
  uri: "ui://APP_NAME/greet",
});

const greet = defineTool({
  name: "greet",
  description: "Greet someone by name.",
  inputSchema: z.object({ name: z.string() }),
  outputSchema: z.object({ greeting: z.string(), emoji: z.string() }),
  ui: greetingCard,
  handler: ({ name }) => ({ greeting: "Hello, " + name + "!", emoji: "👋" }),
});

const app = defineApp({
  name: "APP_NAME",
  version: "1.0.0",
  renderer: "flutter",
  tools: [greet],
});

const port = Number(process.env.PORT ?? 5189);
const emulator = await serveEmulator(app, { port });
console.log("emulator " + emulator.url);
`;

const FLUTTER_PRE_DEPLOY_TS = `import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFlutterComponent, slug } from "@mcpapps/flutter";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const COMPONENT_URI = "ui://APP_NAME/greet";

console.log("Building inlined Flutter component for deploy...");
const component = await buildFlutterComponent({
  projectDir: resolve(root, "flutter"),
  uri: COMPONENT_URI,
  inline: true,
});

// The self-contained HTML is multi-MB (CanvasKit + Dart) -- too large for the
// Worker script bundle. Write it as a static asset; the Worker reads it via the
// ASSETS binding on resources/read (see @mcpapps/server mountMcp).
const assetPath = "/_c/" + slug(COMPONENT_URI) + "/index.html";
const dist = resolve(root, "dist");
await rm(dist, { recursive: true, force: true });
const dest = join(dist, assetPath.replace(/^\\//, ""));
await mkdir(dirname(dest), { recursive: true });
await writeFile(dest, component.html);
console.log("wrote " + (component.html.length / 1024 / 1024).toFixed(1) + "MB to dist" + assetPath);

const metaDir = resolve(here, "generated");
await mkdir(metaDir, { recursive: true });
await writeFile(
  join(metaDir, "component-meta.ts"),
  [
    "// Auto-generated by src/pre-deploy.ts -- do not edit",
    "export const COMPONENT_URI = " + JSON.stringify(COMPONENT_URI) + ";",
    "export const COMPONENT_HTML_ASSET = " + JSON.stringify(assetPath) + ";",
    "export const COMPONENT_CSP = " + JSON.stringify(component.csp ?? {}) + ";",
    "",
  ].join("\\n"),
);
console.log("wrote src/generated/component-meta.ts");
`;

const FLUTTER_WORKER_TS = `import { defineApp, defineTool } from "@mcpapps/server";
import { mountMcp } from "@mcpapps/server/hono";
import { Hono } from "hono";
import { z } from "zod";
import { COMPONENT_CSP, COMPONENT_HTML_ASSET, COMPONENT_URI } from "./generated/component-meta.js";

const greet = defineTool({
  name: "greet",
  description: "Greet someone by name.",
  inputSchema: z.object({ name: z.string() }),
  outputSchema: z.object({ greeting: z.string(), emoji: z.string() }),
  // Self-contained inlined Flutter, served from a static asset (see pre-deploy.ts).
  // COMPONENT_CSP declares fonts.gstatic.com (Flutter's runtime font fallback); add
  // more origins your app contacts via the \`csp\` option in src/pre-deploy.ts.
  ui: { uri: COMPONENT_URI, html: "", htmlAsset: COMPONENT_HTML_ASSET, csp: COMPONENT_CSP },
  handler: ({ name }) => ({ greeting: "Hello, " + name + "!", emoji: "👋" }),
});

const app = defineApp({
  name: "APP_NAME",
  version: "1.0.0",
  renderer: "flutter",
  tools: [greet],
});

const hono = new Hono();
mountMcp(hono, app);

// \`app\` is exported so \`mcpapps audit\` can introspect the tools.
export { app };
export default hono;
`;

const FLUTTER_INDEX_HTML = `<!DOCTYPE html>
<html>
<head>
  <base href="$FLUTTER_BASE_HREF">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Greeting</title>
  <style>html,body{margin:0;padding:0;background:transparent}</style>
</head>
<body>
  <script src="flutter_bootstrap.js" async></script>
</body>
</html>
`;

const FLUTTER_MAIN_DART = `import 'package:flutter/material.dart';
import 'package:mcpapps_bridge/mcpapps_bridge.dart';

void main() => runMcpApp(const GreetingApp());

class GreetingApp extends StatelessWidget {
  const GreetingApp({super.key});

  @override
  Widget build(BuildContext context) {
    final result = McpApp.of(context).result;
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: Colors.transparent,
        body: Center(
          child: Text(
            result == null
                ? 'Waiting…'
                : (result['emoji'] as String) + ' ' + (result['greeting'] as String),
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
          ),
        ),
      ),
    );
  }
}
`;

function flutterPubspec(name: string, bridgeDep: string): string {
  const dartName = name.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  return [
    `name: ${dartName}`,
    "description: A Flutter MCP App component.",
    "version: 0.0.1",
    "publish_to: none",
    "",
    "environment:",
    "  sdk: ^3.11.0",
    '  flutter: ">=3.41.0"',
    "",
    "dependencies:",
    "  flutter:",
    "    sdk: flutter",
    bridgeDep,
    "",
    "flutter:",
    "  uses-material-design: true",
    "",
  ].join("\n");
}

function vueReadme(name: string): string {
  return [
    `# ${name}`,
    "",
    "An MCP App built with [@mcpapps](https://github.com/rubenspeculis/mcp-apps) (Vue renderer).",
    "",
    "```bash",
    "pnpm install",
    "pnpm dev       # host emulator -> http://localhost:5179",
    "pnpm serve     # MCP server (Node) -> http://localhost:8787/mcp",
    "pnpm deploy    # Cloudflare Workers",
    "```",
    "",
    "## Hosts & CSP",
    "",
    "The runtime follows the MCP Apps spec (`2026-01-26`): it runs the `ui/initialize`",
    "handshake and reports its size via `ui/notifications/size-changed`, so flexible",
    "host iframes (e.g. Claude, which gives the iframe no fixed height) size correctly.",
    "",
    "In Claude you may see `Unrecognized Content-Security-Policy directive 'webrtc'`",
    "and a favicon `404` in the console — these are injected by the host, not your app,",
    "and block nothing.",
    "",
    "To call external APIs, declare the origins in `mcpapps.config.ts` via `csp`",
    "(`connectDomains`/`resourceDomains`); they are emitted into the resource's",
    "`_meta.ui.csp` (and the ChatGPT `openai/widgetCSP` key when `compat: true`).",
    "",
  ].join("\n");
}

function flutterReadme(name: string): string {
  return [
    `# ${name}`,
    "",
    "An MCP App built with [@mcpapps](https://github.com/rubenspeculis/mcp-apps) (Flutter renderer).",
    "",
    "Requires Flutter (auto-detected via FLUTTER_BIN, your PATH, or fvm).",
    "",
    "```bash",
    "pnpm install",
    "pnpm start     # builds the Flutter web app + host emulator -> http://localhost:5189",
    "```",
    "",
    "## How it works in Claude",
    "",
    "The runtime follows the MCP Apps spec (`2026-01-26`): `ui/initialize` handshake +",
    "`ui/notifications/size-changed` sizing.",
    "",
    "MCP Apps hosts only accept a single self-contained `text/html;profile=mcp-app`",
    "document (no sibling/relative asset files). So `pnpm deploy` builds the Flutter web",
    "app and **inlines the whole thing into one HTML** (`buildFlutterComponent({ inline:",
    "true })`): scripts inline, CanvasKit's `.wasm`/fonts served via an in-document",
    "`fetch` shim, and CanvasKit's dynamic `import()` redirected by a runtime import-map.",
    "That document is ~10MB, so it's written as a Cloudflare **static asset** and the",
    "Worker returns it from `resources/read` via the `ASSETS` binding (keeping the Worker",
    "script tiny). Claude's sandbox permits WebAssembly, so CanvasKit renders.",
    "",
    "`COMPONENT_CSP` declares `fonts.gstatic.com` (Flutter's runtime font fallback).",
    "Inlined Flutter is usually rendered through iframe `srcdoc`, so route backend calls",
    "through MCP server tools (`McpApp.of(context).callTool(...)` or `McpAppHttpClient`)",
    "instead of relying on direct browser fetch/XHR from the opaque-origin iframe.",
    "",
    "Tall Flutter content starts with a 480px fallback height when the host gives no size.",
    "Wrap vertical scrollables with `McpAutoSize` or call `reportSize` as content changes.",
    "",
    "The `webrtc` CSP warning and favicon `404` you may see in Claude are host-injected",
    "noise, not app errors.",
    "",
  ].join("\n");
}
