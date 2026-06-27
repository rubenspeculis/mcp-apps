import { AppMethods, AppNotifications, HostMethods } from "@mcpapps/protocol";

/**
 * The emulator's host surface. Renders a compiled component in a *real*
 * sandboxed iframe and speaks the exact mcp-ui postMessage JSON-RPC a real host
 * uses, so the component cannot tell the emulator from Claude/ChatGPT. Tool
 * calls run against the same `/mcp` endpoint the real host would hit.
 */
export function renderHostPage(opts: {
  appName: string;
  mcpPath: string;
  renderer: string;
  components: Record<string, { basePath: string }>;
}): string {
  const config = JSON.stringify({
    appName: opts.appName,
    mcpPath: opts.mcpPath,
    renderer: opts.renderer,
    components: opts.components,
    methods: {
      ready: AppMethods.Ready,
      callTool: HostMethods.CallTool,
      requestDisplayMode: HostMethods.RequestDisplayMode,
      sendFollowupPrompt: HostMethods.SendFollowupPrompt,
      toolResult: AppNotifications.ToolResult,
      theme: AppNotifications.Theme,
    },
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(opts.appName)} · mcpapps emulator</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 system-ui, sans-serif; display: grid; grid-template-columns: 340px 1fr; height: 100vh; }
  aside { border-right: 1px solid #8883; padding: 16px; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
  main { display: flex; flex-direction: column; }
  header { padding: 10px 16px; border-bottom: 1px solid #8883; display: flex; gap: 12px; align-items: center; }
  h1 { font-size: 15px; margin: 0 0 4px; }
  .muted { color: #8889; }
  select, textarea, button { font: inherit; padding: 8px; border-radius: 8px; border: 1px solid #8885; background: transparent; color: inherit; width: 100%; }
  textarea { min-height: 120px; font-family: ui-monospace, monospace; resize: vertical; }
  button { cursor: pointer; background: #4f46e5; color: #fff; border: none; }
  button.secondary { background: transparent; border: 1px solid #8885; color: inherit; }
  label { font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #8889; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .frame { flex: 1; padding: 24px; background: #8881; overflow: auto; }
  iframe { width: 100%; height: 100%; min-height: 400px; border: 1px solid #8884; border-radius: 12px; background: #fff; }
  .log { border-top: 1px solid #8883; padding: 8px 16px; max-height: 160px; overflow: auto; font-family: ui-monospace, monospace; font-size: 12px; }
  .log div { white-space: pre-wrap; }
  .row { display: flex; gap: 8px; }
</style>
</head>
<body>
  <aside>
    <div>
      <h1>${escapeHtml(opts.appName)}</h1>
      <div class="muted">mcpapps host emulator</div>
    </div>
    <div class="field">
      <label for="tool">Tool</label>
      <select id="tool"></select>
    </div>
    <div class="field">
      <label for="args">Arguments (JSON)</label>
      <textarea id="args" spellcheck="false"></textarea>
    </div>
    <div class="row">
      <button id="invoke">Invoke tool</button>
      <button id="theme" class="secondary" title="Toggle theme">🌓</button>
    </div>
  </aside>
  <main>
    <header>
      <strong>Preview</strong>
      <span class="muted" id="status">idle</span>
    </header>
    <div class="frame"><iframe id="view" sandbox="allow-scripts"></iframe></div>
    <div class="log" id="log"></div>
  </main>
<script>
const CONFIG = ${config};
const M = CONFIG.methods;
const $ = (id) => document.getElementById(id);
let tools = [];
let currentTool = null;
let currentResult = null;
let colorScheme = "light";

function log(...args) {
  const el = document.createElement("div");
  el.textContent = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  $("log").prepend(el);
}

async function rpc(method, params) {
  const res = await fetch(CONFIG.mcpPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now() + Math.random(), method, params }),
  });
  if (res.status === 202) return null;
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

function sampleFromSchema(schema) {
  if (!schema || typeof schema !== "object") return null;
  if (schema.type === "object") {
    const out = {};
    for (const [k, v] of Object.entries(schema.properties || {})) out[k] = sampleFromSchema(v);
    return out;
  }
  if (schema.type === "array") return [];
  if (schema.type === "number" || schema.type === "integer") return 0;
  if (schema.type === "boolean") return false;
  if (schema.enum) return schema.enum[0];
  return "";
}

async function loadTools() {
  const result = await rpc("tools/list");
  tools = result.tools || [];
  const sel = $("tool");
  sel.innerHTML = "";
  for (const t of tools) {
    const opt = document.createElement("option");
    opt.value = t.name;
    opt.textContent = t.name;
    sel.appendChild(opt);
  }
  selectTool(tools[0]?.name);
}

function selectTool(name) {
  currentTool = tools.find((t) => t.name === name) || null;
  if (!currentTool) return;
  $("args").value = JSON.stringify(sampleFromSchema(currentTool.inputSchema), null, 2);
}

async function invoke() {
  if (!currentTool) return;
  let args;
  try { args = JSON.parse($("args").value || "{}"); }
  catch (e) { log("Invalid JSON args:", e.message); return; }

  $("status").textContent = "calling " + currentTool.name + "…";
  let result;
  try { result = await rpc("tools/call", { name: currentTool.name, arguments: args }); }
  catch (e) { log("tool error:", e.message); $("status").textContent = "error"; return; }

  currentResult = { toolName: currentTool.name, structuredContent: result.structuredContent, isError: !!result.isError };
  log("tool result:", currentResult.structuredContent);

  const uri = currentTool._meta && currentTool._meta.ui && currentTool._meta.ui.resourceUri;
  if (!uri) { $("status").textContent = "tool has no UI"; return; }

  const view = $("view");
  const bundled = CONFIG.components[uri];
  if (bundled && bundled.basePath) {
    // Asset-bundled (Flutter): load from a served URL so relative assets resolve.
    view.removeAttribute("srcdoc");
    view.setAttribute("sandbox", "allow-scripts allow-same-origin");
    view.src = bundled.basePath;
    $("status").textContent = "rendered (flutter) " + uri;
  } else {
    // Self-contained (Vue): inline the HTML via srcdoc in a strict sandbox.
    const read = await rpc("resources/read", { uri });
    view.setAttribute("sandbox", "allow-scripts");
    view.removeAttribute("src");
    view.srcdoc = read.contents[0].text;
    $("status").textContent = "rendered " + uri;
  }
}

// Host side of the postMessage JSON-RPC link with the iframe component.
window.addEventListener("message", async (event) => {
  const msg = event.data;
  if (!msg || msg.jsonrpc !== "2.0") return;
  const view = $("view").contentWindow;

  // Notification from app.
  if (msg.method === M.ready && msg.id === undefined) {
    if (currentResult) {
      view.postMessage({ jsonrpc: "2.0", method: M.toolResult, params: currentResult }, "*");
      view.postMessage({ jsonrpc: "2.0", method: M.theme, params: { colorScheme, tokens: {} } }, "*");
    }
    return;
  }
  // Request from app -> fulfil and respond.
  if (msg.id !== undefined) {
    try {
      let result = {};
      if (msg.method === M.callTool) {
        const r = await rpc("tools/call", msg.params);
        result = r;
        currentResult = { toolName: msg.params.name, structuredContent: r.structuredContent, isError: !!r.isError };
        log("app called tool:", msg.params.name);
      } else if (msg.method === M.requestDisplayMode) {
        log("app requested display mode:", msg.params && msg.params.mode);
      } else if (msg.method === M.sendFollowupPrompt) {
        log("app sent follow-up prompt:", msg.params && msg.params.prompt);
      }
      view.postMessage({ jsonrpc: "2.0", id: msg.id, result }, "*");
    } catch (e) {
      view.postMessage({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: e.message } }, "*");
    }
  }
});

$("tool").addEventListener("change", (e) => selectTool(e.target.value));
$("invoke").addEventListener("click", invoke);
$("theme").addEventListener("click", () => {
  colorScheme = colorScheme === "light" ? "dark" : "light";
  const view = $("view").contentWindow;
  view && view.postMessage({ jsonrpc: "2.0", method: M.theme, params: { colorScheme, tokens: {} } }, "*");
  log("theme:", colorScheme);
});

loadTools().catch((e) => log("failed to load tools:", e.message));

// Live-reload: re-render the current tool when the dev server signals a change.
try {
  const reloadSource = new EventSource("/_mcpapps/reload");
  reloadSource.onmessage = () => { if (currentTool) { log("reloading…"); invoke(); } };
} catch (e) { /* EventSource unavailable */ }
</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}
