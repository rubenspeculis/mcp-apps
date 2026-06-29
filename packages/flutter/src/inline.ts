import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { mimeFor } from "./mime.js";

export interface InlineFlutterOptions {
  /** The Flutter web build dir (index.html, main.dart.js, canvaskit/, assets/, …). */
  webDir: string;
  /** The bundled host-glue JS (`mcpapps-host.js`) to inline into the document. */
  hostGlue: string;
}

/**
 * Fold a multi-file Flutter web build into ONE self-contained HTML document.
 *
 * Why: MCP Apps hosts (Claude) only serve a single `text/html;profile=mcp-app`
 * document — no sibling/relative asset files. Flutter is inherently multi-file
 * (main.dart.js, canvaskit.js/.wasm, fonts, manifests). We inline every asset as
 * base64 and install runtime shims so Flutter's loader resolves them locally:
 *
 *  - `fetch`/`XMLHttpRequest` are shimmed to answer asset requests from the
 *    base64 map with a synthesized `Response` (no network → CSP `connect-src`
 *    safe; `.wasm` served as `application/wasm` for `instantiateStreaming`).
 *  - `document.createElement('script')` is patched so a `src` pointing at a
 *    bundled `.js` is replaced by an INLINE script (executes under
 *    `'unsafe-inline'`; no `blob:`/`data:` script src, whose CSP support is
 *    unknown). A synthetic `load` event is dispatched so the loader proceeds.
 *
 * WebAssembly itself runs because Claude's sandbox permits it (verified).
 */
export async function inlineFlutterBuild(opts: InlineFlutterOptions): Promise<string> {
  const files = new Map<string, Uint8Array>();
  for await (const file of walk(opts.webDir)) {
    const rel = relative(opts.webDir, file).split(sep).join("/");
    if (!includeAsset(rel)) continue;
    files.set(rel, new Uint8Array(await readFile(file)));
  }

  const indexBuf = files.get("index.html");
  let index = indexBuf
    ? new TextDecoder().decode(indexBuf)
    : "<!doctype html><html><head></head><body></body></html>";
  files.delete("index.html");

  // flutter_bootstrap.js is referenced by a parsed <script src> in index.html, so
  // our createElement hook can't catch it — inline its text directly instead.
  const bootstrapJs = decodeOrEmpty(files.get("flutter_bootstrap.js"));
  files.delete("flutter_bootstrap.js");
  // The service worker is irrelevant when everything is inlined.
  files.delete("flutter_service_worker.js");

  const assets: Record<string, { m: string; d: string }> = {};
  for (const [rel, buf] of files) {
    assets[rel] = { m: mimeFor(rel), d: base64(buf) };
  }

  const interceptor = INTERCEPTOR_JS.replace("__ASSETS_JSON__", JSON.stringify(assets));

  // Neutralize <base href> so relative resolution is predictable; the shims match
  // by path suffix/basename regardless.
  index = index.replace(/<base[^>]*>/i, "");
  // Drop the separately-served host-glue tag; we inline the glue below.
  index = index.replace(/<script[^>]*src=["']mcpapps-host\.js["'][^>]*><\/script>/i, "");

  const headInject = `<script>${interceptor}</script>\n<script>${opts.hostGlue}</script>\n`;
  index = index.includes("</head>")
    ? index.replace("</head>", `${headInject}</head>`)
    : headInject + index;

  // Inline the bootstrap where its <script src> used to be (keep load order).
  const bootstrapTag = `<script>${bootstrapJs}</script>`;
  if (/<script[^>]*src=["']flutter_bootstrap\.js["'][^>]*><\/script>/i.test(index)) {
    index = index.replace(
      /<script[^>]*src=["']flutter_bootstrap\.js["'][^>]*><\/script>/i,
      bootstrapTag,
    );
  } else if (index.includes("</body>")) {
    index = index.replace("</body>", `${bootstrapTag}</body>`);
  } else {
    index += bootstrapTag;
  }

  return index;
}

/**
 * Keep only what Flutter loads at runtime. `flutter build web --no-web-resources-cdn`
 * bundles EVERY CanvasKit variant (default, chromium, skwasm, wimp, experimental) plus
 * `.symbols` debug maps and legal NOTICES — tens of MB the app never fetches. A dart2js
 * build uses the canvaskit renderer; the browser picks the `chromium` variant on
 * Chromium and the default elsewhere, so we keep just those two.
 */
function includeAsset(rel: string): boolean {
  if (rel.endsWith(".symbols")) return false;
  if (rel === "assets/NOTICES") return false;
  if (rel === "version.json" || rel === ".last_build_id") return false;
  if (rel.startsWith("canvaskit/")) {
    // Chromium-based browsers (incl. Claude's renderer) load the `chromium`
    // CanvasKit variant; keep only it. Falls back below for non-Chromium hosts.
    return /^canvaskit\/chromium\/canvaskit\.(js|wasm)$/.test(rel);
  }
  return true;
}

function decodeOrEmpty(buf: Uint8Array | undefined): string {
  return buf ? new TextDecoder().decode(buf) : "";
}

function base64(buf: Uint8Array): string {
  return Buffer.from(buf).toString("base64");
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

/**
 * Runtime shim injected first into the document. `__ASSETS_JSON__` is replaced
 * with `{ "<relpath>": { m: <mime>, d: <base64> } }`. Must contain no literal
 * `</script>` (we never emit one here).
 */
const INTERCEPTOR_JS = `
(function(){
  var A=__ASSETS_JSON__;
  function bytes(d){var s=atob(d);var u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u;}
  function rel(u){var p;try{p=new URL(u,location.href).pathname;}catch(e){p=String(u);}return p.replace(/^\\/+/,'');}
  function find(u){if(!u)return null;var p=rel(u);if(A[p])return p;var b=p.split('/').pop();for(var k in A){if(k===p||k.indexOf('/'+p)===k.length-p.length-1||(p.length>k.length&&p.slice(-k.length-1)==='/'+k)||k===b||k.slice(-(b.length+1))==='/'+b)return k;}return null;}
  function isJs(k){return /(javascript|ecmascript)/.test(A[k].m)||/\\.m?js(\\?|$)/.test(k);}
  function makeResp(k){return new Response(bytes(A[k].d),{status:200,headers:{'Content-Type':A[k].m}});}

  // CanvasKit's canvaskit.js is loaded via dynamic import() — uninterceptable by
  // the fetch/script-element shims. Redirect it with an import map to an inlined
  // data: module (its .wasm still flows through the fetch shim below). Injected
  // before flutter_bootstrap runs, using the native createElement (patched later).
  try{
    var imap={imports:{}};
    for(var ik in A){if(/canvaskit\\/(chromium\\/)?canvaskit\\.js$/.test(ik)){imap.imports[new URL(ik,document.baseURI).href]='data:text/javascript;base64,'+A[ik].d;}}
    if(Object.keys(imap.imports).length){var im=document.createElement('script');im.type='importmap';im.textContent=JSON.stringify(imap);(document.head||document.documentElement).appendChild(im);}
  }catch(e){console.error('[inline] importmap inject failed',e);}

  var of=window.fetch?window.fetch.bind(window):null;
  window.fetch=function(input,init){var u=typeof input==='string'?input:(input&&input.url);var k=find(u);if(k)return Promise.resolve(makeResp(k));return of?of(input,init):Promise.reject(new Error('inline: blocked fetch '+u));};

  var OX=window.XMLHttpRequest;
  function SX(){this._real=null;this._k=null;this.readyState=0;}
  SX.prototype.open=function(m,u){this._k=find(u);if(this._k){this._m=m;}else{this._real=new OX();this._real.open.apply(this._real,arguments);}};
  SX.prototype.setRequestHeader=function(){if(this._real)this._real.setRequestHeader.apply(this._real,arguments);};
  SX.prototype.getAllResponseHeaders=function(){return this._real?this._real.getAllResponseHeaders():('content-type: '+A[this._k].m+'\\r\\n');};
  SX.prototype.getResponseHeader=function(n){return this._real?this._real.getResponseHeader(n):(/content-type/i.test(n)?A[this._k].m:null);};
  SX.prototype.addEventListener=function(e,cb){this['on'+e]=cb;if(this._real)this._real.addEventListener(e,cb);};
  SX.prototype.send=function(b){var self=this;if(this._real){['onload','onerror','onprogress','onreadystatechange'].forEach(function(e){if(self[e])self._real[e]=self[e];});this._real.responseType=this.responseType||'';this._real.send(b);return;}var u=bytes(A[this._k].d);var txt=(this.responseType===''||this.responseType==='text');self.status=200;self.readyState=4;self.response=txt?new TextDecoder().decode(u):u.buffer;self.responseText=txt?new TextDecoder().decode(u):'';setTimeout(function(){if(self.onreadystatechange)self.onreadystatechange();if(self.onload)self.onload();},0);};
  window.XMLHttpRequest=SX;

  var oac=Node.prototype.appendChild;
  Node.prototype.appendChild=function(n){var r=oac.call(this,n);if(n&&n.__inlined){setTimeout(function(){try{n.dispatchEvent(new Event('load'));}catch(e){}if(n.onload){try{n.onload(new Event('load'));}catch(e){}}},0);}return r;};

  var origCreate=Document.prototype.createElement;
  Document.prototype.createElement=function(tag){var el=origCreate.call(this,tag);if(String(tag).toLowerCase()==='script'){hook(el);}return el;};
  function apply(el,v){var k=find(v);if(k){if(isJs(k)){el.removeAttribute('src');el.__inlined=true;el.text=new TextDecoder().decode(bytes(A[k].d));}else{el.setAttribute('src','data:'+A[k].m+';base64,'+A[k].d);}}else{el.setAttribute('src',v);}}
  function hook(el){
    Object.defineProperty(el,'src',{configurable:true,enumerable:true,get:function(){return el.getAttribute('src')||'';},set:function(v){apply(el,v);}});
    var os=el.setAttribute.bind(el);el.setAttribute=function(n,v){if(String(n).toLowerCase()==='src'){apply(el,v);return;}return os(n,v);};
  }
})();
`;
