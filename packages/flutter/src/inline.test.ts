import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inlineFlutterBuild } from "./inline.js";

let webDir: string;

beforeEach(async () => {
  webDir = await mkdtemp(join(tmpdir(), "mcpapps-flutter-web-"));
});
afterEach(async () => {
  await rm(webDir, { recursive: true, force: true });
});

async function fixtureBuild() {
  await writeFile(
    join(webDir, "index.html"),
    `<!doctype html><html><head><base href="/app/"></head>` +
      `<body><script src="flutter_bootstrap.js" async></script></body></html>`,
  );
  await writeFile(join(webDir, "flutter_bootstrap.js"), "/* bootstrap */ console.log('boot');");
  await writeFile(join(webDir, "main.dart.js"), "/* app */");
  await writeFile(join(webDir, "flutter_service_worker.js"), "/* sw */");
  await writeFile(join(webDir, "main.dart.js.symbols"), "symbols");
  await mkdir(join(webDir, "assets"), { recursive: true });
  await writeFile(join(webDir, "assets", "NOTICES"), "legal text");
  await writeFile(join(webDir, "assets", "AssetManifest.json"), "{}");
  await mkdir(join(webDir, "canvaskit", "chromium"), { recursive: true });
  await writeFile(join(webDir, "canvaskit", "chromium", "canvaskit.js"), "/* ck */");
  await writeFile(join(webDir, "canvaskit", "chromium", "canvaskit.wasm"), "wasm");
  await writeFile(join(webDir, "canvaskit", "skwasm.js"), "/* skwasm */");
}

describe("inlineFlutterBuild", () => {
  it("folds the build into one self-contained HTML document", async () => {
    await fixtureBuild();
    const html = await inlineFlutterBuild({ webDir, hostGlue: "/* HOST_GLUE_MARKER */" });

    // Single document with the runtime shim + host glue inlined into <head>.
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("HOST_GLUE_MARKER");
    expect(html).toContain("window.fetch="); // interceptor present
    // <base href> is neutralized so the shims resolve assets predictably.
    expect(html).not.toContain("<base");
    // The bootstrap <script src> is replaced by its inlined contents.
    expect(html).toContain("console.log('boot')");
    expect(html).not.toMatch(/<script[^>]*src=["']flutter_bootstrap\.js["']/);
  });

  it("embeds runtime assets and drops the heavy/unused ones", async () => {
    await fixtureBuild();
    const html = await inlineFlutterBuild({ webDir, hostGlue: "" });

    // Kept: runtime assets are present as keys in the inlined asset map.
    expect(html).toContain('"main.dart.js"');
    expect(html).toContain('"canvaskit/chromium/canvaskit.js"');
    expect(html).toContain('"assets/AssetManifest.json"');
    // Dropped: service worker, symbols, NOTICES, non-chromium CanvasKit variants.
    expect(html).not.toContain("flutter_service_worker.js");
    expect(html).not.toContain(".symbols");
    expect(html).not.toContain("assets/NOTICES");
    expect(html).not.toContain("skwasm.js");
  });
});
