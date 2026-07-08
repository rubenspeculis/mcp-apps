import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inlineFlutterBuild } from "./inline.js";

/**
 * `inline.test.ts` proves the assembled HTML string has the right shape
 * (asset keys present, invariants held); it never runs the inlined
 * `INTERCEPTOR_JS` shim. This suite loads the real output in a real browser
 * and drives `fetch`/`XMLHttpRequest` against it, so the shim's actual
 * runtime behavior — not just its source text — is under test.
 *
 * Requires a Playwright chromium install (`playwright install chromium`);
 * skips cleanly, not fails, when unavailable — mirroring `mcpapps audit`'s
 * own graceful runtime-layer skip so this never blocks the core test gate.
 */

// biome-ignore lint/suspicious/noExplicitAny: structural Playwright types, kept local like audit.ts does.
let chromium: any;
let browserAvailable = false;
try {
  ({ chromium } = await import("playwright"));
  const probe = await chromium.launch();
  await probe.close();
  browserAvailable = true;
} catch {
  browserAvailable = false;
}

let webDir: string;

beforeEach(async () => {
  webDir = await mkdtemp(join(tmpdir(), "mcpapps-flutter-browser-"));
});
afterEach(async () => {
  await rm(webDir, { recursive: true, force: true });
});

describe.runIf(browserAvailable)("inlineFlutterBuild — real browser execution", () => {
  it("actually intercepts fetch() and returns the inlined asset via the shim", async () => {
    await writeFile(
      join(webDir, "index.html"),
      "<!doctype html><html><head></head><body></body></html>",
    );
    await mkdir(join(webDir, "assets"), { recursive: true });
    await writeFile(join(webDir, "assets", "data.json"), JSON.stringify({ hello: "world" }));

    const html = await inlineFlutterBuild({ webDir, hostGlue: "" });
    const htmlPath = join(webDir, "__test.html");
    await writeFile(htmlPath, html);

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`file://${htmlPath}`);
      const result = await page.evaluate(async () => {
        const res = await fetch("assets/data.json");
        return {
          status: res.status,
          contentType: res.headers.get("content-type"),
          body: await res.json(),
        };
      });
      expect(result.status).toBe(200);
      expect(result.contentType).toBe("application/json");
      expect(result.body).toEqual({ hello: "world" });
    } finally {
      await browser.close();
    }
  });

  it("actually intercepts XMLHttpRequest and returns the inlined asset via the shim", async () => {
    await writeFile(
      join(webDir, "index.html"),
      "<!doctype html><html><head></head><body></body></html>",
    );
    await mkdir(join(webDir, "assets"), { recursive: true });
    await writeFile(join(webDir, "assets", "data.json"), JSON.stringify({ via: "xhr" }));

    const html = await inlineFlutterBuild({ webDir, hostGlue: "" });
    const htmlPath = join(webDir, "__test.html");
    await writeFile(htmlPath, html);

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`file://${htmlPath}`);
      const responseText = await page.evaluate(
        () =>
          new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", "assets/data.json");
            xhr.onload = () => resolve(xhr.responseText);
            xhr.onerror = () => reject(new Error("xhr error"));
            xhr.send();
          }),
      );
      expect(JSON.parse(responseText)).toEqual({ via: "xhr" });
    } finally {
      await browser.close();
    }
  });
});
