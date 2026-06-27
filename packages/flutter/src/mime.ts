const MIME: Record<string, string> = {
  html: "text/html",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  css: "text/css",
  wasm: "application/wasm",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  bin: "application/octet-stream",
  map: "application/json",
  txt: "text/plain",
  xml: "application/xml",
};

export function mimeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}
