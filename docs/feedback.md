# Feedback for the @mcpapps team — making a Flutter MCP component work end‑to‑end

Context: we built a real Flutter MCP app (`otivo-ai-mcp`, deployed to Cloudflare Workers) that
renders an interactive financial **retirement calculator** — a tall, scrollable Flutter widget with
charts that fetches projection data from a backend. Getting it working in the **Claude** MCP host
surfaced two framework‑level gaps that every non‑trivial Flutter component will hit. Both are
currently solvable only with app‑level workarounds; this note documents them and proposes
first‑class fixes.

Versions: `@mcpapps/{server,client-core,flutter,protocol,dev,cli}@0.1.3`, `mcpapps_bridge` (Dart)
`v0.1.2`, Flutter 3.41.

TL;DR — two issues:

1. **A Flutter component can't reliably make HTTP requests.** It's served as a single inlined HTML
   document and rendered by the host via an iframe `srcdoc`, i.e. an **opaque origin**. A direct
   cross‑origin browser fetch (Dio/`package:http` → XHR/fetch) from that sandbox **does not resolve**
   — even with correct CORS on the server and the target origin declared in the component CSP
   `connectDomains`. We had to route all component→server HTTP through the host `callTool` bridge.
2. **A Flutter component can't size itself to its content.** The Flutter host glue pins a **fixed
   viewport height** (`hostContext.containerDimensions.height`, else a **480px default**) and calls
   `reportSize` **once** at init. Flutter's canvas has no intrinsic content height, so anything taller
   than 480px is clipped. We had to measure content height in Dart and call `reportSize` ourselves.

Neither is obvious; both cost us significant debugging. Out‑of‑the‑box support (or at least
documentation + a Dart helper) would make Flutter components viable for anyone.

---

## Issue 1 — Networking from a Flutter component (the big one)

### What happens

- A component with an inlined Flutter build is delivered via `resources/read` as a single
  `text/html;profile=mcp-app` string (see `@mcpapps/server` `readResource` / `mountMcp` `resolveHtml`,
  and the `htmlAsset` note in `@mcpapps/protocol`'s `index.d.ts`).
- Hosts render that string in an iframe via **`srcdoc`** (confirmed in `@mcpapps/dev`'s emulator:
  the Vue/self‑contained path does `v.srcdoc = …` with `sandbox="allow-scripts"`; only the
  `basePath`/multi‑file path uses a real `src`). Claude renders our inlined Flutter component via
  `srcdoc`.
- A `srcdoc` iframe has an **opaque origin**. Relative URLs resolve against the host page (not the
  Worker), and a cross‑origin fetch sends `Origin: null`.

### What we observed

We made the server side completely correct and it still failed:

- The Worker injected its own absolute origin into the served HTML so the component had a real base
  URL; the Worker route returned proper **CORS** (`Access-Control-Allow-Origin: *`, `OPTIONS`
  preflight) and the origin was listed in the component CSP `connectDomains`.
- `curl` against the Worker route returned `200` with the full JSON, and a browser network panel
  showed a `200`.
- **But the component's own Dio/XHR `POST` never resolved** — no response, no error. Our calculator
  sat in a permanent "running" state (an on‑screen debug strip reading the Riverpod state showed
  `status=running`, `result=null`, `err=-` forever). So this is _not_ a CORS/CSP misconfig and _not_
  a backend problem — the browser request from the opaque‑origin Flutter sandbox simply does not
  complete.

### What made it work

Route **all** component→server HTTP through the host `callTool` bridge instead of a browser fetch:

1. Add a server tool that does the work (`run_projection`) — it forwards the request to the backend
   and returns the result as `structuredContent`.
2. On the Dart side, replace the HTTP client with a tiny adapter that turns each request into
   `McpApp.callTool('run_projection', body)`. The host executes `tools/call` against the server
   (server‑side, no browser fetch, no CORS, no origin issues) and returns the result.

```dart
// Dio HttpClientAdapter that bridges HTTP → MCP host callTool.
class _CallToolHttpAdapter implements HttpClientAdapter {
  _CallToolHttpAdapter(this._callTool);
  final Future<Map<String, dynamic>?> Function(String name, Map<String, dynamic> args) _callTool;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? _) async {
    final args = /* decode JSON body from requestStream */;
    final result = await _callTool('run_projection', args) ?? {};
    return ResponseBody.fromBytes(utf8.encode(jsonEncode(result)), 200,
        headers: {Headers.contentTypeHeader: [Headers.jsonContentType]});
  }
  @override
  void close({bool force = false}) {}
}
```

Helpful detail we confirmed: the Flutter glue's `callTool` returns `env.structuredContent`
(unwrapped), so the Dart side receives the tool's structured output directly — good, keep that.

### Why this is a framework problem, not just ours

- Every Flutter component that talks to a backend will hit this. The current docs imply "direct
  browser fetch + declare origins in CSP" (same as the `fonts.gstatic.com` example), but that path
  does **not** work for XHR/fetch from the `srcdoc` sandbox in practice.
- The workaround forces every app to (a) wrap each backend endpoint in a server tool and (b) hand‑roll
  an HTTP‑client adapter in Dart — non‑obvious and easy to get wrong.

### Suggested fixes (any one would help; in priority order)

1. **First‑class host‑proxied fetch.** Expose a bridge method like
   `bridge.fetch(url, { method, headers, body })` that the host performs (server‑side or from the
   host's own origin) and returns `{ status, headers, body }`. Mirror it in `mcpapps_bridge` (Dart)
   and ship a ready‑made Dio/`http` adapter so existing networking code "just works".
2. **Ship the `callTool` HTTP adapter** as part of `mcpapps_bridge` (e.g.
   `McpAppHttpClient` / a `Dio` adapter) with docs, so apps don't reinvent it. Even just documenting
   "direct fetch is unreliable under `srcdoc`; route through `callTool`" + this snippet would save days.
3. **Serve Flutter components via iframe `src`** (a real, same‑origin URL) instead of `srcdoc` where
   the host supports it — then relative fetches reach the server normally. The protocol already has
   `basePath` for multi‑file Flutter; consider using a served URL for the inlined case too.

---

## Issue 2 — Flutter components can't size to their content

### What happens

The `@mcpapps/flutter` host glue (the injected `HOST_GLUE_SOURCE`) does this once at init:

```js
const DEFAULT_HEIGHT = 480;
function applyContainerSize(ctx) {
  const dims = (ctx && ctx.containerDimensions) || {};
  const height = dims.height || dims.maxHeight || DEFAULT_HEIGHT;
  const width = dims.width || window.innerWidth || 360;
  document.documentElement.style.height = height + "px";
  if (document.body) document.body.style.height = height + "px";
  bridge.reportSize(width, height);
}
```

- It comments, correctly, that "Flutter's canvas fills its host page and has no intrinsic content
  height, so we must give it a concrete viewport AND report a size."
- But it sets a **fixed** height (host‑provided or 480px) and never observes content growth. The
  generic `observeSize` (`ResizeObserver` on the root) used for Vue in `client-core` is **not** used
  on the Flutter path, and `el.scrollHeight` wouldn't reflect Flutter content anyway (the canvas is
  viewport‑sized).

Result: our calculator (form + 280px chart + stats + tabs ≈ 1500px) was clipped to 480px — the chart
was below the fold and looked like it "never loaded".

### What made it work

Measure the real content height in Dart and report it ourselves. The calculator's results view is a
`SingleChildScrollView`, which dispatches `ScrollMetricsNotification`; the content height is
`maxScrollExtent + viewportDimension`. On change we grow the document/body height (so Flutter
re‑lays‑out the full content) and call `reportSize`:

```dart
NotificationListener<ScrollMetricsNotification>(
  onNotification: (n) {
    final h = (n.metrics.maxScrollExtent + n.metrics.viewportDimension).ceil();
    (web.document.documentElement as web.HTMLElement?)?.style.height = '${h}px';
    web.document.body?.style.height = '${h}px';
    McpApp.of(context).reportSize(web.window.innerWidth, h); // grow-only + threshold
    return false;
  },
  child: child,
)
```

`mcpapps_bridge` does expose `reportSize(int, int)` (good) — but this measure‑and‑report loop is
non‑obvious, depends on the component happening to contain a scrollable, and fights the glue's fixed
body height.

### Suggested fixes

1. **Content‑driven sizing for Flutter, in the glue.** Set the Flutter host element to size to its
   content (or observe a designated content element) and `reportSize` on change — so a component just
   lays out at its natural height. If Flutter's canvas makes this hard, expose a documented
   contract: "render into element `#mcp-content`; the glue observes it."
2. **A Dart helper in `mcpapps_bridge`.** e.g. an `McpAutoSize(child:)` widget or
   `McpApp.of(context).autoReportSize()` that does the measure‑and‑report correctly (including the
   body‑height set) so apps don't hand‑roll it.
3. **Document the pattern** and the 480px default prominently — and consider raising/removing the
   default so tall components aren't silently clipped.

---

## Minor / related notes

- **Dart bridge surface.** `mcpapps_bridge`'s `McpAppController` exposes `result`, `colorScheme`,
  `callTool`, `ready`, `reportSize`, `initialize` — but **not** `requestDisplayMode` (it's JS‑only in
  `client-core`'s `HostBridge`). A tall component would benefit from
  `requestDisplayMode('fullscreen')`; please surface it in the Dart bridge.
- **Server origin discovery.** A component has no built‑in way to learn its own server's origin
  (needed for any absolute URL). We worked around it by having the Worker inject
  `globalThis.__MCP_ORIGIN__` via a custom `resolveHtml`. If direct fetch is ever supported, consider
  the framework injecting the server origin (and auto‑populating CSP `connectDomains`) for the
  component.
- **`additionalProperties: false` on tool output.** The output schema is derived strictly, so a tool
  must return _only_ declared fields — worth calling out in docs (it bit us early).
- **What's already good:** `callTool` returning `structuredContent` unwrapped; `reportSize` existing
  on the Dart bridge; the `compat`/`openai/widgetCSP` handling; the dev emulator. The two issues above
  are the gap between "renders" and "actually works".

## Summary of asks

- [ ] A host‑proxied fetch (or a shipped `callTool` HTTP adapter) so Flutter components can do HTTP
      without hitting the `srcdoc` opaque‑origin wall — **highest impact**.
- [ ] Content‑driven sizing for Flutter (glue auto‑resize or a Dart `autoReportSize`/`McpAutoSize`).
- [ ] Surface `requestDisplayMode` on the Dart bridge.
- [ ] Docs: srcdoc/opaque‑origin networking caveat, the 480px sizing default, and the
      `additionalProperties:false` output rule.

Happy to share the full working app (`otivo-ai-mcp`) as a reference implementation of both workarounds.
