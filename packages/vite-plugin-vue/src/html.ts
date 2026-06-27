/**
 * Wrap a compiled component's JS + CSS into a minimal, self-contained HTML
 * document. Everything is inlined: no external network requests, which keeps the
 * resource CSP-friendly inside the host's sandboxed iframe.
 */
export function renderComponentHtml(opts: { js: string; css: string; title?: string }): string {
  const title = opts.title ?? "MCP App";
  const style = opts.css ? `<style>${opts.css}</style>` : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>html,body{margin:0;padding:0}</style>
    ${style}
  </head>
  <body>
    <div id="root"></div>
    <script>${opts.js}</script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}
