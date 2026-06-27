export type Renderer = "vue" | "flutter";

export interface TemplateOptions {
  /** Package name, e.g. "my-mcp-app". */
  name: string;
  renderer: Renderer;
  /** Version spec for @mcpapps/* deps ("workspace:*" in-repo, else a range). */
  dep: string;
}

/** Build the full file map (relative path -> contents) for a new project. */
export function buildTemplate(opts: TemplateOptions): Record<string, string> {
  return opts.renderer === "flutter" ? flutterTemplate(opts) : vueTemplate(opts);
}

// Concrete third-party versions so the generated project installs anywhere
// (the monorepo `catalog:` is not resolvable outside it).
const V = {
  hono: "^4.6.0",
  nodeServer: "^1.13.0",
  zod: "^3.24.0",
  vue: "^3.5.0",
  vite: "^6.0.0",
  pluginVue: "^5.2.0",
  tsx: "^4.19.0",
  typescript: "^5.7.0",
  typesNode: "^22.10.0",
  wrangler: "^3.95.0",
};

function vueTemplate({ name, dep }: TemplateOptions): Record<string, string> {
  return {
    "package.json": json({
      name,
      version: "0.0.0",
      private: true,
      type: "module",
      scripts: {
        codegen: "tsx scripts/build-components.ts",
        dev: "tsx scripts/build-components.ts && tsx src/dev.ts",
        serve: "tsx scripts/build-components.ts && tsx src/server.ts",
        build: "tsx scripts/build-components.ts && tsc --noEmit",
        typecheck: "tsx scripts/build-components.ts && tsc --noEmit",
        deploy: "tsx scripts/build-components.ts && wrangler deploy",
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
        "@mcpapps/dev": dep,
        "@mcpapps/vite-plugin-vue": dep,
        "@types/node": V.typesNode,
        "@vitejs/plugin-vue": V.pluginVue,
        tsx: V.tsx,
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
    "wrangler.toml": [
      `name = "${name}"`,
      'main = "src/worker.ts"',
      'compatibility_date = "2024-12-01"',
      'compatibility_flags = ["nodejs_compat"]',
      "",
    ].join("\n"),
    "README.md": vueReadme(name),
    "src/shared/schemas.ts": VUE_SCHEMAS,
    "src/mcpapps.d.ts": MCPAPPS_DTS,
    "src/components/GreetingCard.vue": GREETING_VUE,
    "src/app.ts": APP_TS,
    "scripts/build-components.ts": BUILD_COMPONENTS_TS,
    "src/server.ts": SERVER_TS,
    "src/worker.ts": WORKER_TS,
    "src/dev.ts": DEV_TS,
  };
}

function flutterTemplate({ name, dep }: TemplateOptions): Record<string, string> {
  return {
    "package.json": json({
      name,
      version: "0.0.0",
      private: true,
      type: "module",
      scripts: {
        start: "tsx src/dev.ts",
        build: "tsc --noEmit",
        typecheck: "tsc --noEmit",
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
        "@mcpapps/dev": dep,
        "@types/node": V.typesNode,
        tsx: V.tsx,
        typescript: V.typescript,
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
    ".gitignore": "node_modules/\nflutter/build/\nflutter/.dart_tool/\n.wrangler/\n*.log\n",
    "README.md": flutterReadme(name),
    "src/dev.ts": FLUTTER_DEV_TS,
    "flutter/.fvmrc": '{\n  "flutter": "3.41.9"\n}\n',
    "flutter/pubspec.yaml": flutterPubspec(name),
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

const BUILD_COMPONENTS_TS = `import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeComponentsModule } from "@mcpapps/vite-plugin-vue";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

await writeComponentsModule(
  [
    {
      name: "greetingCard",
      entry: resolve(root, "src/components/GreetingCard.vue"),
      uri: "ui://APP_NAME/greet",
      title: "Greeting",
    },
  ],
  resolve(root, "src/generated/components.ts"),
  { root },
);

console.log("compiled Vue components -> src/generated/components.ts");
`;

const SERVER_TS = `import { serve } from "@hono/node-server";
import { mountMcp } from "@mcpapps/server/hono";
import { Hono } from "hono";
import { app } from "./app.js";

const hono = new Hono();
mountMcp(hono, app);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: hono.fetch, port }, (info) => {
  console.log("MCP server on http://localhost:" + info.port + "/mcp");
});
`;

const WORKER_TS = `import { mountMcp } from "@mcpapps/server/hono";
import { Hono } from "hono";
import { app } from "./app.js";

const hono = new Hono();
mountMcp(hono, app);

export default hono;
`;

const DEV_TS = `import { serveEmulator } from "@mcpapps/dev";
import { app } from "./app.js";

const port = Number(process.env.PORT ?? 5179);
const emulator = await serveEmulator(app, { port });
console.log("emulator " + emulator.url);
console.log("mcp      " + emulator.url + "/mcp");
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

function flutterPubspec(name: string): string {
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
    "  mcpapps_bridge:",
    "    git:",
    "      url: https://github.com/rubenspeculis/mcp-apps.git",
    "      path: packages/flutter_bridge",
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
  ].join("\n");
}
