# CLAUDE.md

`@mcpapps/*` — a pnpm + turbo monorepo for building **MCP Apps** (interactive `ui://`
components a host like Claude/ChatGPT renders in a sandboxed iframe). Renderers: **Vue**
(inlined HTML) and **Flutter** (CanvasKit, inlined to one HTML for Claude).

## Commands
- `pnpm build` — turbo build. `pnpm check` — the full gate (biome ci + typecheck + tests). Tests are **vitest** (not pest), colocated `*.test.ts`.
- `pnpm dev:vue` / `pnpm dev:flutter` — run an example in the host emulator (`packages/dev`).
- `pnpm --filter @mcpapps/example-weather-flutter deploy` — deploy an example (Cloudflare Workers / wrangler).

## Architecture
- `packages/protocol/src/{constants,messages}.ts` is the **single source of truth** for the MCP Apps wire contract (spec `2026-01-26`). Method-name/type edits here cascade to: `client-core` (postMessage bridge), `dev/host-page.ts` (emulator host side — keep spec-accurate or dev diverges from Claude), and `server/mcp-handler.ts`.
- Lifecycle: app sends `ui/initialize` → host returns `hostContext` → app sends `ui/notifications/initialized` → host pushes `tool-input`/`tool-result`. App MUST send `ui/notifications/size-changed` (ResizeObserver) or the host iframe collapses to 0 height.
- Hosts serve **one self-contained** `text/html;profile=mcp-app` resource — no sibling assets. Vue inlines to `srcdoc`; Flutter is folded into one HTML by `packages/flutter/src/inline.ts` (fetch-shim for wasm/fonts, import-map for CanvasKit) and served as a CF **static asset** read via the Worker `ASSETS` binding (`CompiledComponent.htmlAsset` + `mountMcp` resolver).

## Claude sandbox CSP (verified this repo)
Allows inline scripts, `eval`, WebAssembly, and `blob:`/`data:` dynamic `import()`; `frame-src 'self' blob: data:`; honors `_meta.ui.csp.connectDomains`. Flutter needs `fonts.gstatic.com` (runtime Noto font fallback) — `buildFlutterComponent` declares it by default.

## Gotchas
- `tsconfig.base.json` sets **`exactOptionalPropertyTypes`** — never assign explicit `undefined` to an optional prop; gate with a conditional or widen with `| undefined`.
- Conventional commits; **commitlint body lines ≤100 chars**; lefthook pre-commit runs biome; commits land on `main`.
- Flutter builds via **fvm** (`.fvmrc` pins version); `flutter build web --no-web-resources-cdn` bundles CanvasKit locally.
- `examples/weather-flutter` uses a **local path** dep on `packages/flutter_bridge`; the CLI template scaffolds a **git** dep — push bridge changes before scaffolded projects see them.
- Dep versions pinned in the `pnpm-workspace.yaml` **catalog** with `minimumReleaseAge: 10080` (7-day supply-chain gate).
