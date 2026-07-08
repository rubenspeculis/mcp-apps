# mcp-apps Repository Review — July 2026

A full read-only audit of the `@mcpapps/*` monorepo covering architecture and design,
documentation, security, testing, host validation (Claude and ChatGPT), and CI/release
engineering, with a prioritized recommendations backlog. Every finding cites the file and
line it was verified against. **No code was changed as part of this review.**

- **Repo**: `mcpapps-monorepo` (pnpm 11.9 + Turbo, Node ≥ 22)
- **Spec targeted**: MCP Apps extension (SEP-1865), version `2026-01-26`
- **Review date**: 2026-07-08
- **Method**: three parallel deep-read passes (architecture/docs, security surfaces,
  testing/host-validation), followed by manual verification of every cited claim against
  source.

---

## 1. Executive summary

The tool works, and the fundamentals are genuinely strong: the wire contract has a true
single source of truth, documentation is unusually thorough for a project of this age,
tool I/O is schema-validated on both sides, and the supply-chain posture is better than
most production repos. The design decision that most pays off is making the dev emulator
import its method names from `@mcpapps/protocol` so it *cannot* drift from the spec.

The weaknesses cluster in two places:

1. **The conformance tooling is itself unverified.** `mcpapps audit` — the feature that
   validates apps against Claude/ChatGPT requirements — is ~90% untested, and its most
   valuable layer (the headless-browser runtime pass) never runs in CI.
2. **Host-specific knowledge is scattered, not modeled.** What Claude requires
   (single self-contained HTML, size-changed lifecycle) and what ChatGPT requires
   (`openai/*` metadata, snake_case CSP) live in comments and ad-hoc branches across five
   files, with no per-host validation profile. The audit checks *generic* conformance
   well but validates *neither host's* specific contract.

### Top findings at a glance

| # | Severity | Area | Finding | Where |
|---|----------|------|---------|-------|
| 1 | High | Testing | `audit.ts` (the host-validation core) has tests for only 1 of ~10 functions | `packages/cli/src/audit.ts`, `audit.test.ts` |
| 2 | High | CI | Runtime (browser) audit layer never runs in CI — only `--static-only` | `.github/workflows/ci.yml:28-45` |
| 3 | High | Host validation | ChatGPT compat drops 2 of 4 CSP buckets silently (`frameDomains`, `baseUriDomains`) | `packages/server/src/mcp-handler.ts:164-171` |
| 4 | High | Host validation | No per-host validation: audit never checks `openai/*` shape, single-file byte budget, or spec version | `packages/cli/src/audit.ts` |
| 5 | Medium | Security | postMessage transport: no `event.origin`/`event.source` check inbound; `targetOrigin: "*"` outbound | `packages/client-core/src/transport.ts:31,34-38,43` |
| 6 | Medium | Security | MCP HTTP handler ships no auth hook and CORS `*` by default | `packages/server/src/mcp-handler.ts:36-43` |
| 7 | Medium | Protocol | `PROTOCOL_VERSION` (`2026-01-26`) is never enforced; MCP transport echoes back any client version | `packages/protocol/src/constants.ts:8`, `mcp-handler.ts:14,248-251` |
| 8 | Medium | Security | CSP audit validates bucket *shape* but not origin *syntax* (`*`, `data:`, `http://` pass) | `packages/cli/src/audit.ts:160-179` |
| 9 | Medium | Testing | Dart bridge tests and coverage thresholds are outside the `pnpm check`/CI gate | `package.json`, `vitest.shared.ts:15-20` |
| 10 | Low | Docs | Examples and the Dart `flutter_bridge` package lack READMEs; `docs/feedback.md` is a loose field report | `examples/*`, `packages/flutter_bridge` |

---

## 2. Scope and methodology

**In scope**: all 11 TypeScript packages under `packages/`, the Dart package
`packages/flutter_bridge`, both examples, the docs site content structure, root tooling
config, and both GitHub workflows.

**Out of scope**: the rendered docs-site prose quality, the Flutter/Dart implementation
internals beyond its bridge surface, and any dynamic testing (this review ran no builds,
tests, or browsers — it is a source-level audit).

**Confidence**: every `path:line` reference below was verified by reading the cited file
during this review. Findings are stated as facts of the code as of commit `0f2f7d3`.

---

## 3. Architecture and design

### 3.1 Package graph

```
protocol  ←──────────────── (everything depends on it)
client-core → protocol
server      → protocol                      (peer: hono, zod)
vue         → client-core, protocol         (peer: vue)
vite-plugin-vue → protocol                  (peer: vite, @vitejs/plugin-vue)
flutter     → protocol, esbuild             (bundles client-core glue)
typegen     → (peer: zod)
dev         → protocol, server, hono, @hono/node-server
cli         → jiti (+ lazy playwright); loads project modules dynamically
create      → cli
flutter_bridge (Dart) → js_interop onto the client-core glue
```

### 3.2 What is designed well

- **Protocol as single source of truth.** Every wire-level string — method names,
  `PROTOCOL_VERSION`, `MCP_APP_MIME`, `UI_SCHEME` — lives in
  `packages/protocol/src/constants.ts`, explicitly so a spec change is "a one-line edit,
  never a hunt across packages" (`constants.ts:1-5`). Payload shapes
  (`CompiledComponent`, `UiMeta`, `McpUiResourceCsp`, `HostContext`) live in
  `messages.ts`. This is the contract producers (renderer builds) and consumers
  (server, emulator, bridge) share, and it holds in practice.
- **The emulator cannot drift from the spec.** `packages/dev/src/host-page.ts` embeds
  the protocol method names from `@mcpapps/protocol` into the generated host page
  (`CONFIG.methods`, `host-page.ts:93-94`), and a test asserts the exact method strings
  appear (`host-page.test.ts`). The emulator also deliberately applies **no minimum
  iframe height**, so the classic 0-height collapse (an app forgetting
  `ui/notifications/size-changed`) is immediately visible in dev.
- **Clean layering with a single postMessage peer.** `client-core`'s `HostBridge` is the
  only code that speaks postMessage; Vue reaches it through provide/inject
  (`packages/vue/src/bridge.ts`), and Flutter reaches the same esbuild-bundled glue via
  `js_interop`. Renderers never reimplement the lifecycle.
- **Two-mode Flutter output matches host reality.** `buildFlutterComponent` produces an
  asset-map + `basePath` for dev (multi-file, served) or a single inlined HTML for
  Claude (`packages/flutter/src/build.ts:38-43,84-100`), with the CanvasKit variant
  pruned to just the Chromium build the host actually loads
  (`packages/flutter/src/inline.ts:92-102`).
- **Release-aware scaffolding.** The CLI resolves dependencies contextually
  (`detectDep`/`detectBridgeDep` in `packages/cli/src/create.ts`): `workspace:*` + a
  local Dart `path:` dep in-repo, else caret npm ranges + a git dep pinned to the
  released `v<cli-version>` tag — so published scaffolds track a release, not `main`.
- **Build pipeline is conventional and coherent**: tsup per package, Turbo
  orchestration with `dependsOn: ^build`, a version catalog in `pnpm-workspace.yaml`,
  changesets in lockstep (`fixed: [["@mcpapps/*"]]`).

### 3.3 Design weaknesses

- **No host-profile abstraction.** Claude-specific knowledge (single-file constraint,
  sandbox CSP behavior, Chromium renderer, `fonts.gstatic.com` need) and
  ChatGPT-specific knowledge (`openai/outputTemplate`, `openai/widgetCSP` snake_case) are
  spread across `inline.ts:12-29`, `build.ts:38-43,108-122`, `html.ts`,
  `mcp-handler.ts:164-192`, and `CLAUDE.md`. There is no single table/type describing
  "what host X requires", which is why the audit (section 7) cannot validate per-host.
- **Version duality without negotiation.** The MCP transport layer advertises
  `SUPPORTED_PROTOCOL_VERSION = "2025-06-18"` (`mcp-handler.ts:14`) while the UI
  extension speaks `2026-01-26` (`constants.ts:8`). Both are legitimate (base protocol
  vs. apps extension) but `negotiateVersion` simply echoes whatever the client sent
  (`mcp-handler.ts:248-251`) — no floor, no rejection, no compatibility check. Neither
  version is ever *enforced* anywhere.
- **`examples/weather-flutter` bypasses the CLI.** It drives builds via bespoke `tsx`
  scripts (`src/dev.ts`, `src/pre-deploy.ts`) rather than `mcpapps dev/build`, meaning
  the Flutter path of the CLI's own commands has no in-repo consumer exercising it the
  way users will.

---

## 4. Documentation review

### 4.1 State: strong, three layers

| Layer | Coverage | Notes |
|-------|----------|-------|
| Per-package READMEs | 10/10 published npm packages | 21–33 lines each; consistent |
| Per-package CHANGELOGs | 10/10 | changesets-managed |
| Inline JSDoc | High density everywhere | protocol ≈54 blocks, cli ≈44, client-core ≈33; the tricky code (lifecycle, inlining, audit) is the *best* documented |
| Docs site (`docs/content/`) | Full Nuxt/Docus site | getting-started (5 pages), concepts (4), guides (7), packages (11), examples (2), comparison (1) |
| Contributor docs | `CLAUDE.md` + root `README.md` | Accurate; gotchas verified against source |

The comment quality deserves specific praise: comments explain *constraints*, not
mechanics — e.g. why CanvasKit must be bundled same-origin (`build.ts:71-73`), why the
base64 asset map cannot break out of its `<script>` tag (`inline.ts:120-124`), why
`playwright` is imported via a non-literal specifier (`audit.ts:263-268`).

### 4.2 Gaps

1. **`examples/weather-vue` and `examples/weather-flutter` have no README.** They are
   documented on the docs site (`docs/content/5.examples/`), but a developer browsing
   the repo (or a scaffold user comparing against the example) gets nothing in-place.
2. **`packages/flutter_bridge` (Dart) has no README and no CHANGELOG.** It is outside
   the changesets/npm flow, but it *is* a published surface — scaffolded apps depend on
   it via a git tag. Its API (`runMcpApp`, `McpApp.of`, `McpAppHttpClient`,
   `McpAutoSize`) is only documented at `docs/content/4.packages/8.flutter-bridge.md`.
3. **`docs/feedback.md`** is an 11 KB out-of-band field report (real-world Flutter
   integration findings) sitting loose in the docs app root. Its content is valuable —
   it should be folded into the Flutter guide or an internals section, or it will rot.
4. **No documented security/trust model.** The sandbox-delegation posture described in
   section 5.1 below is a deliberate and defensible design, but it is nowhere written
   down; a "Security model" page in `docs/content/2.concepts/` would pre-empt the
   questions this review raises.

---

## 5. Security review

### 5.1 Trust model (implicit)

The system's real security boundary is **the host's sandboxed iframe**, not this code.
The app assumes: (a) the host renders it in a locked-down cross-origin iframe, (b) the
host enforces the declared CSP, (c) the only window able to postMessage it is the host.
Those assumptions hold on Claude (verified per `CLAUDE.md` and `inline.ts:15-29`) — but
they are *assumptions of the deployment environment*, not properties of the code, and
they are currently undocumented (see 4.2.4).

### 5.2 postMessage bridge — the main weakness cluster

- **No inbound origin/source validation.** `onWindowMessage` dispatches any message
  whose payload has `jsonrpc === "2.0"` — that is the entire gate
  (`packages/client-core/src/transport.ts:34-38`, `isLikelyJsonRpc` at `:90-94`).
  Neither `event.origin` nor `event.source` is examined. Any window that can obtain a
  reference to the app window can inject `tool-result`, `tool-input`, or
  `host-context-changed` notifications.
- **Outbound `targetOrigin` defaults to `"*"`** (`transport.ts:31,43`), and
  `createHostBridge` never overrides it (`host-bridge.ts:88-89`), so every outgoing
  message — including `tools/call` arguments and `ui/message` free text — is posted to
  whatever origin occupies the parent frame.
- **No schema validation of host payloads.** Inbound params are consumed via unchecked
  casts: `message.params as ToolInputParams` (`host-bridge.ts:134`), `as HostContext`
  (`:139`). The protocol package is types-only; no zod exists on the client side.
- The emulator host page mirrors the same posture: `jsonrpc === "2.0"` is the only
  inbound check (`packages/dev/src/host-page.ts:223-225`) and all posts to the iframe
  use `"*"` (`:176,179,261,263,273`). Acceptable for a dev tool; worth a comment.

**Assessment**: in the intended deployment (sandboxed iframe whose only peer is
`window.parent`) these are mitigated by the environment. But `srcdoc`-loaded sandboxed
iframes have an opaque origin, which is precisely why `"*"` was chosen — a constraint
worth documenting, and worth an optional `expectedOrigin` hook for hosts that do expose
a concrete origin.

### 5.3 CSP — declarative, well-shaped, unenforced and under-validated

- CSP is a **four-bucket declarative model** (`connectDomains`, `resourceDomains`,
  `frameDomains`, `baseUriDomains`) defined once (`protocol/src/messages.ts:19-28`) with
  a documented secure-by-default stance (omitted = no external access). Arbitrary CSP
  directives are deliberately not exposed — a good decision.
- **The server never emits a `Content-Security-Policy` HTTP header.** Enforcement is
  wholly delegated to the host honoring `_meta.ui.csp`. Correct per spec, but it means a
  non-conforming host yields *no* CSP at all.
- **Shape is validated; syntax is not.** `cspShapeCheck` (`cli/src/audit.ts:160-179`)
  rejects unknown buckets and non-string-arrays, but `"*"`, `"data:"`,
  `"http://insecure.example"`, or `"'unsafe-inline'"` all pass as "origin strings".
- **Every Flutter component force-allowlists `https://fonts.gstatic.com`** into *both*
  connect and resource buckets (`flutter/src/build.ts:101,117-122`). The reason is
  legitimate (Noto fallback glyph fetches), it is documented, and caller origins are
  preserved — but it is unconditional: there is no opt-out for teams that bundle full
  fonts and want zero third-party runtime contact. This is a (small) privacy/exfil
  surface every Flutter app inherits silently.

### 5.4 HTML inlining and injection

- **Solid.** Assets are base64-encoded before embedding (`inline.ts:51-54,108-110`), so
  asset bytes cannot contain a literal `</script>` breakout; the invariant is documented
  (`inline.ts:120-124`). The interceptor is folded in via
  `JSON.stringify(assets)` replacement (`:56`), not string concatenation of raw bytes.
- The verbatim-inlined scripts (host glue, `flutter_bootstrap.js`, Vue IIFE bundles at
  `vite-plugin-vue/src/html.ts`) are **build artifacts**, not runtime/user content —
  low risk, with the residual assumption that bundler output never contains
  `</script>` (true for esbuild/Rollup default escaping of string literals, but worth a
  guard: one `.includes("</script>")` assertion at inline time would make it explicit).
- **Tool-result data never touches an HTML sink.** Results flow over postMessage into
  Vue reactive bindings (`vue/src/hooks.ts`), which auto-escape. Grep-verified: no
  `v-html`, no `dangerouslySetInnerHTML`, no `eval`, no `new Function`, no dynamic
  import of remote URLs anywhere in source. The CanvasKit import map points at a
  `data:` module built from a *local* base64 asset (`inline.ts:134-142`).

### 5.5 Server (`mcp-handler.ts`)

- **Input AND output zod validation on tool calls** — `safeParse` on arguments before
  the handler (`:200-203`) and on output after (`:212-215`), with structured
  `toolError` results. Unknown tool/resource and missing params are handled (`:196-198,
  :227-231`). This is better than most MCP servers, which validate input only.
- **No auth hook.** The handler has no authentication/authorization surface at all;
  `initialize` answers unconditionally (`:126-131`).
- **CORS is `*` by default** (`cors ?? true` → `Access-Control-Allow-Origin: *`,
  `:36-43`). For the browser emulator this is necessary; for a deployed Worker it means
  any web page can invoke `tools/call`. Harmless for the deterministic example tools;
  hazardous the moment a user's tool has side effects or secrets.
- **Raw exception messages are returned to clients** — internal errors (`:108-112`) and
  handler throws (`:209`). A tool handler that throws with sensitive context leaks it.

### 5.6 Dev emulator sandbox

- Vue components: `sandbox="allow-scripts"` only, loaded via `srcdoc`
  (`host-page.ts:89,215-217`) — strict and correct.
- Flutter components: `sandbox="allow-scripts allow-same-origin"` with `src =
  basePath` (`:209-210`). `allow-scripts` + `allow-same-origin` is the classic
  sandbox-escape combination, but here the frame is same-origin *to the local dev
  emulator only*, and Flutter's relative asset loading requires it. Dev-only surface;
  fine, but deserves an inline comment so it is never copied into a production host.

### 5.7 Supply chain — the strongest area

- **7-day release-age gate**: `minimumReleaseAge: 10080` with a tight, commented
  exclusion list (own scopes, docs-site deps, pinned Cloudflare runtime versions)
  (`pnpm-workspace.yaml:6-25`).
- **Install-script allowlist**: `allowBuilds` names exactly seven packages permitted to
  run build scripts (`:61-68`) — this is why Playwright's browser download cannot happen
  implicitly (see CI, section 8).
- **Version catalog** as single source of truth (`:27-59`); **security overrides** pin
  known-risky transitives (`tmp`, `js-yaml`, `undici`, `ws`, `esbuild`, `:70-79`) with a
  documented scoped exception for changesets' legacy js-yaml usage.
- **No remote fetches at build time**: CanvasKit is bundled via
  `--no-web-resources-cdn` by default (`flutter/src/build.ts:71-73`); the CDN is
  explicit opt-in. The only persistent remote runtime origin is the
  `fonts.gstatic.com` allowlist (5.3).
- **Deploy surface is clean**: both example `wrangler.jsonc` files are minimal (the
  Flutter one adds only the `ASSETS` static binding); no secrets, no env access in
  worker code; `htmlAsset` resolution uses a build-time constant, not request input
  (`server/src/hono.ts`), so no path traversal from user data.

---

## 6. Testing review

### 6.1 Inventory

13 Vitest files (all unit-level, node environment except one jsdom) plus one Dart test
file. What exists is good: focused, readable, and pointed at the contract.

| Package | Tested | Untested (notable) |
|---|---|---|
| protocol | `jsonrpc.test.ts` (type guards) | `constants.ts`, `messages.ts` (types-only; low risk) |
| server | `mcp-handler.test.ts` (138 lines — initialize, tools, resources, error codes, **openai compat keys**), `stdio.test.ts` | `hono.ts` (`mountMcp` + `ASSETS` resolver), `define.ts` directly |
| client-core | `host-bridge.test.ts` (193 lines — handshake, timeout fallback, replay, correlation) | `renderer.ts` (`mountApp`, `observeSize`) |
| dev | `host-page.test.ts` (spec-string embedding) | `emulator.ts`, `serve.ts`, `tunnel.ts` |
| flutter | `inline.test.ts`, `build.test.ts` (2 of ~10 exports) | `buildFlutterComponent` itself, `host-glue.ts`, `resolve.ts`; **`INTERCEPTOR_JS` is only string-matched, never executed** |
| vue | `hooks.test.ts` (jsdom) | `adapter.ts`, `bridge.ts`, `registry.ts` |
| vite-plugin-vue | `html.test.ts` | `build.ts` (`buildVueComponent`, `writeComponentsModule` — used by audit runtime) |
| typegen | `typegen.test.ts` | edge cases of `json-schema-to-dart.ts` |
| cli | `create.test.ts` (127 lines — solid), `audit.test.ts` (23 lines) | **`audit.ts` almost entirely** + `args.ts`, `cli.ts`, `commands.ts`, `config.ts`, `templates.ts` |
| flutter_bridge (Dart) | `http_helpers_test.dart` | bridge lifecycle |
| examples | `weather-vue/src/e2e.test.ts` (in-process, not a browser) | weather-flutter has none |

### 6.2 The critical gap: the validator is unvalidated

`packages/cli/src/audit.ts` is the product's conformance authority, and only
`originAllowed` (`audit.ts:417-432`) has unit tests. Untested:

- `staticConfigChecks` (`:124-157`), `cspShapeCheck` (`:160-179`),
  `staticToolChecks` (`:200-242`), `flutterArtifactChecks` (`:115-122`),
  `loadApp` (`:181-198`) — all pure-ish and *easy* to unit test.
- The entire runtime layer: `runtimeChecks` (`:256-302`), `ensureComponents`
  (`:305-345`), `auditToolInBrowser` (`:352-414`).

These are exercised only end-to-end via `mcpapps audit --static-only` on the two
examples in CI — which proves the happy path parses, not that the checks *fail when they
should*. A validator whose failure modes are untested provides false confidence: a
regression that made `cspShapeCheck` silently accept everything would pass CI today.

### 6.3 Gate analysis

- `pnpm check` = `biome ci . && turbo typecheck test` — lint + strict typecheck
  (`exactOptionalPropertyTypes`) + unit tests. Reasonable core gate.
- **Dart tests are outside the gate**: `test:flutter-bridge` runs only via root
  `pnpm test` (and lefthook pre-push), never via `pnpm check`, therefore **never in
  CI**.
- **Coverage thresholds exist but bind nothing**: 20 % lines / 15 % branches configured
  (`vitest.shared.ts:15-20`) but `coverage` is a separate script no gate invokes. As
  configured they are aspirational documentation.
- `passWithNoTests: true` (`vitest.shared.ts:11`) is pragmatic for Turbo fan-out, but
  combined with unenforced coverage it means a package can silently lose its entire
  test suite and CI stays green.
- **No true browser test anywhere in the suite.** The one place a real browser runs
  (Playwright in `audit --runtime`) is skipped in CI. The postMessage transport,
  ResizeObserver sizing, and the Flutter interceptor shims — the code whose whole
  purpose is browser behavior — are tested only through mocks or string matching.

---

## 7. Host validation: Claude and ChatGPT

This was an explicit focus of the review. There are two mechanisms, and the honest
summary is: **the generic layer is well built; the host-specific layer is thin.**

### 7.1 Mechanism A — ChatGPT compat emission (server)

Gated on `AppDefinition.compat`. When true, `describeTool` mirrors the spec `_meta.ui`
block into vendor keys (`mcp-handler.ts:173-192`):

- `openai/outputTemplate` = the tool's `ui://` URI (`:179`)
- `mcpui.dev/ui-resource-uri` = same (`:180`)
- `openai/widgetCSP` = snake_case CSP translation (`:181-182`), also emitted on
  `resources/read` content `_meta` (`:233-236`)

This is tested (`mcp-handler.test.ts` asserts the keys). Two verified issues:

1. **`openaiWidgetCsp` maps only 2 of the 4 CSP buckets** — `connectDomains →
   connect_domains` and `resourceDomains → resource_domains`; `frameDomains` and
   `baseUriDomains` are silently dropped (`mcp-handler.ts:165-171`). An app that
   declares `frameDomains` for Claude gets a ChatGPT widget CSP that omits them, with
   no warning anywhere. If ChatGPT's widget CSP genuinely has no equivalent fields,
   that constraint should be documented and the audit should warn when a compat-enabled
   app declares the unmappable buckets.
2. **Compat is all-or-nothing and shape-unverified.** Nothing validates that the
   emitted `openai/*` structure matches what ChatGPT actually accepts — there is no
   fixture, no schema, no audit check (see 7.2).

### 7.2 Mechanism B — `mcpapps audit` (CLI conformance)

Two layers (`audit.ts:64-112`):

**Static (always runs; runs in CI on both examples):**
- renderer ∈ {vue, flutter}; component name present; URI matches `ui://…`; entry file
  exists (`staticConfigChecks`, `:124-157`)
- CSP restricted to the four supported buckets, arrays of strings (`cspShapeCheck`,
  `:160-179`)
- tool name matches `[a-zA-Z0-9_-]+`; input+output schemas required; UI components must
  have a body (`html`/`htmlAsset`/`basePath`) (`staticToolChecks`, `:200-242`)
- Flutter: generated `component-meta.ts` exists (`:115-122`)

**Runtime (headless Chromium; default-on locally, never in CI):**
- Boots the real emulator, drives each UI tool, asserts the `ui/initialize` lifecycle
  completes and the iframe reports **non-zero height** — directly encoding Claude's
  flexible-iframe requirement and catching the 0-height collapse (`:352-395`)
- **CSP drift detection**: monitors every network request and fails on any origin not
  declared in `connectDomains`/`resourceDomains`, with wildcard matching (`:358-411`,
  `originAllowed` `:417-432`). This is the standout idea in the whole validation story
  — it verifies *behavior against declaration*, which static analysis cannot.

### 7.3 What neither mechanism validates (the gaps that matter)

1. **Nothing validates the ChatGPT-specific contract.** The audit never inspects
   `openai/outputTemplate` / `openai/widgetCSP` emission at all — an app with
   `compat: true` and a broken widget CSP passes every check. There is no
   "validate as ChatGPT" mode.
2. **Nothing validates the Claude single-file constraint.** The constraint that Claude
   serves exactly one self-contained `text/html;profile=mcp-app` resource is
   load-bearing (it's why `inline.ts` exists), yet the audit accepts a component whose
   only body is `basePath` (`:225-231`) — which Claude cannot serve — with no
   host-conditional warning. There is also **no output byte-size budget check**
   anywhere, despite inlined Flutter documents being multi-megabyte; if Claude imposes
   (or ever introduces) a resource size limit, nothing here would catch it before
   deploy.
3. **Spec version is never enforced.** `PROTOCOL_VERSION = "2026-01-26"` is declared
   (`constants.ts:8`) and hardcoded in the emulator's initialize response
   (`host-page.ts:246`), but no component — bridge, handler, or audit — ever *checks*
   it. The MCP transport separately echoes back any client-proposed version
   (`mcp-handler.ts:248-251`).
4. **The runtime layer's CSP allowlist ignores `frameDomains`.** `auditToolInBrowser`
   builds its declared-set from connect+resource buckets only (`:358-361`), so a
   component that legitimately frames a declared `frameDomains` origin would be flagged
   as drift — and conversely frame-loads are judged by the wrong buckets.
5. **The audit's own correctness is unverified** (section 6.2), and its most
   host-realistic layer never runs in CI (section 8).

### 7.4 Suggested shape of a fix (design sketch, not implemented)

Introduce a **host profile** type in `@mcpapps/protocol` — e.g.
`{ id: "claude" | "chatgpt", requiresSingleFile, maxResourceBytes?, metaKeys,
cspTranslation, sandboxFacts }` — and make both the compat emission and the audit
consume it: `mcpapps audit --host claude`, `--host chatgpt`, or `--host all`. That
single abstraction converts today's scattered comments into executable validation, gives
the ChatGPT path its first real checks, and gives the docs a page to render from.

---

## 8. CI and release engineering

**CI** (`.github/workflows/ci.yml`): one `check` job on push-to-main and all PRs, with
concurrency cancellation. Steps: frozen-lockfile install → `pnpm check` → `pnpm build` →
`mcpapps audit --static-only` on both examples (`ci.yml:34-45`). The audit-in-CI step is
a genuinely good idea — few frameworks dogfood their conformance tool on every PR.

Verified gaps:

1. **Playwright's browser is deliberately not installed** (`ci.yml:28-31`, and
   `playwright` is absent from `allowBuilds`), so the runtime audit layer — lifecycle,
   sizing, CSP drift — never executes in CI. The comment frames this as keeping the
   core gate fast, which is fair; the fix is a *separate* job (or nightly/label-gated
   job) that installs Chromium and runs `audit --runtime`, not slowing the core gate.
2. **Dart bridge tests never run in CI** (they are outside `pnpm check`; section 6.3).
3. **Coverage is not measured in CI** (thresholds unenforced; section 6.3).

**Release** (`.github/workflows/release.yml`): changesets flow — a "Version Packages" PR,
then on merge `pnpm ship` (= `pnpm check && turbo build && pnpm -r publish`) with **npm
Trusted Publishing via OIDC** (`id-token: write`, no long-lived NPM_TOKEN), lefthook
disabled for the bot, per-package changeset tags plus the `v<cli-version>` tag that
scaffolded Flutter apps pin their git dependency to. All packages version in lockstep
(`fixed: [["@mcpapps/*"]]`), examples excluded. This is a modern, low-risk release
setup; the OIDC choice in particular removes the most commonly-stolen credential class.

One note: `pnpm ship` re-runs `check` but **not** the static audits — a release could
ship a conformance regression that CI on the PR did catch only if the PR ran (always
true in practice via branch protection, but the publish path itself is unaudited).

---

## 9. Recommendations

Prioritized backlog. None of these were applied in this review.

### Critical / High

1. **Unit-test the audit validators** (`packages/cli/src/audit.ts`). The static checks
   are pure functions over plain objects — table-driven tests asserting both pass *and
   fail* outcomes for `staticConfigChecks`, `cspShapeCheck`, `staticToolChecks`,
   `flutterArtifactChecks`, and `loadApp` are cheap and close the biggest
   false-confidence hole (finding #1).
2. **Run the runtime audit in CI** — a separate job that adds Playwright to
   `allowBuilds` (or uses the official container), installs Chromium, builds, and runs
   `mcpapps audit --runtime` on `weather-vue` (Vue needs no Flutter SDK). Nightly or
   PR-label-gated if minutes matter (finding #2).
3. **Introduce host validation profiles** (design sketch in 7.4): make
   `mcpapps audit --host claude|chatgpt|all` check the host-specific contract —
   single-file body + byte-size budget for Claude; `openai/*` key shape, snake_case CSP
   completeness, and a warning on unmappable `frameDomains`/`baseUriDomains` for
   ChatGPT (findings #3, #4).
4. **Validate CSP origin syntax**, not just shape: each entry should parse as an
   `https:` origin (optionally with a leading `*.` wildcard label); reject `*`,
   bare schemes, `data:`, quotes-keywords (finding #8).
5. **Include `frameDomains` in the runtime drift allowlist** and judge frame
   navigations against it (`audit.ts:358-361`; finding in 7.3.4).

### Medium

6. **Harden the postMessage boundary** — accept an optional `expectedOrigin` in
   `createPostMessageTransport`, check `event.source === window.parent`, and add
   lightweight runtime validation (hand-rolled guards are fine; zod would add weight to
   the client bundle) for `ToolInputParams`/`HostContext`/`ToolResultEnvelope`. Where
   `"*"` must remain (opaque srcdoc origins), document why at the call site.
7. **Add an auth hook and CORS configuration to `createMcpHandler`** — e.g.
   `authorize?: (request) => boolean | Promise<boolean>` and `cors?: boolean | { origin:
   string }` — and sanitize error responses (map internal exceptions to a generic
   message, keep detail server-side).
8. **Enforce protocol versions**: have the bridge assert the host's `ui/initialize`
   response version is compatible with `PROTOCOL_VERSION` (warn or fall back
   deliberately), and give `negotiateVersion` a supported floor instead of echoing.
9. **Wire Dart tests and coverage into the gate**: add `test:flutter-bridge` to CI
   (needs a Flutter setup step or a dedicated job), and either enforce the coverage
   thresholds in `check` or delete them — unenforced thresholds mislead.
10. **Make the `fonts.gstatic.com` injection opt-out** (`includeFontCdn?: boolean` on
    `buildFlutterComponent`) for apps that bundle complete fonts and want zero
    third-party runtime origins; document the trade-off in the Flutter guide.
11. **Guard the inline invariant**: assert no inlined script chunk contains
    `</script>` at `inlineFlutterBuild`/`renderComponentHtml` time, turning a silent
    corruption into a build error.

### Nice-to-have

12. **READMEs for `examples/*` and `packages/flutter_bridge`** (plus a CHANGELOG or
    version note for the Dart package, since scaffolds pin it by tag).
13. **Fold `docs/feedback.md` into the docs site** (Flutter guide or a new internals
    section) before it drifts.
14. **Add a "Security model" concepts page** documenting the sandbox-delegation trust
    model, the `targetOrigin: "*"` rationale, and the CSP enforcement boundary
    (host-side, not server-side).
15. **A real browser test for the lifecycle** (Playwright, reusing the audit's
    machinery) covering the actual postMessage transport, ResizeObserver sizing, and —
    for Flutter — executing the `INTERCEPTOR_JS` shims instead of string-matching them.
16. **Run the static audits inside `pnpm ship`** so the publish path enforces
    conformance independently of PR CI.
17. **Migrate `examples/weather-flutter` onto the CLI commands** it currently bypasses,
    so the Flutter path of `mcpapps dev/build` gets an in-repo consumer.

---

## Appendix A — Package inventory reference

| Package | Version | Purpose | Key files |
|---|---|---|---|
| `@mcpapps/protocol` | 0.1.4 | Wire-contract SSOT (types + constants, zero deps) | `src/constants.ts`, `src/messages.ts`, `src/jsonrpc.ts` |
| `@mcpapps/client-core` | 0.1.4 | In-iframe runtime; sole postMessage peer | `src/host-bridge.ts`, `src/transport.ts`, `src/renderer.ts` |
| `@mcpapps/server` | 0.1.4 | Workers-native MCP server (Hono-mountable, stdio) | `src/mcp-handler.ts`, `src/define.ts`, `src/hono.ts`, `src/stdio.ts` |
| `@mcpapps/vue` | 0.1.4 | Vue renderer: hooks + adapter | `src/hooks.ts`, `src/adapter.ts`, `src/bridge.ts`, `src/registry.ts` |
| `@mcpapps/vite-plugin-vue` | 0.1.4 | SFC → single self-contained `ui://` HTML | `src/build.ts`, `src/html.ts` |
| `@mcpapps/flutter` | 0.1.4 | Flutter Web → `ui://` component (asset-map or inlined) | `src/build.ts`, `src/inline.ts`, `src/host-glue.ts` |
| `@mcpapps/typegen` | 0.1.4 | zod → JSON Schema → Dart models | `src/json-schema-to-dart.ts` |
| `@mcpapps/dev` | 0.1.4 | Host emulator + dev server + tunnel | `src/emulator.ts`, `src/host-page.ts`, `src/serve.ts`, `src/tunnel.ts` |
| `@mcpapps/cli` | 0.1.4 | `mcpapps` CLI: create/dev/serve/build/audit/deploy | `src/cli.ts`, `src/commands.ts`, `src/create.ts`, `src/templates.ts`, `src/audit.ts` |
| `@mcpapps/create` | 0.1.4 | `pnpm create @mcpapps` wrapper | `bin/mcpapps-create.mjs` |
| `mcpapps_bridge` (Dart) | — | Flutter ↔ host bridge via js_interop | `lib/mcpapps_bridge.dart`, `lib/src/http_helpers.dart` |
| `@mcpapps/example-weather-vue` | private | CLI-driven Vue example (+ in-process e2e test) | `mcpapps.config.ts`, `src/app.ts`, `src/e2e.test.ts` |
| `@mcpapps/example-weather-flutter` | private | Script-driven Flutter example (CF Workers + ASSETS) | `src/dev.ts`, `src/pre-deploy.ts`, `src/worker.ts` |
