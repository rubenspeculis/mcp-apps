import { describe, expect, it } from "vitest";
import { renderComponentHtml } from "./html.js";

describe("renderComponentHtml", () => {
  it("inlines JS into a self-contained document with a root mount point", () => {
    const html = renderComponentHtml({ js: "console.log('hi')", css: "" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain("<script>console.log('hi')</script>");
    // No external references — the whole component is one document.
    expect(html).not.toMatch(/<script[^>]*\bsrc=/);
    expect(html).not.toMatch(/<link[^>]*\bhref=/);
  });

  it("inlines CSS only when provided", () => {
    expect(renderComponentHtml({ js: "", css: ".a{color:red}" })).toContain(
      "<style>.a{color:red}</style>",
    );
    const noCss = renderComponentHtml({ js: "", css: "" });
    // Only the baseline reset style remains; no empty component <style>.
    expect(noCss.match(/<style>/g)?.length).toBe(1);
  });

  it("escapes the title to prevent markup injection", () => {
    const html = renderComponentHtml({ js: "", css: "", title: "</title><img>" });
    expect(html).not.toContain("</title><img>");
    expect(html).toContain("&lt;/title&gt;&lt;img&gt;");
  });
});
