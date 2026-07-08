import { describe, expect, it } from "vitest";
import { FLUTTER_FONT_CDN, resolveComponentCsp, slug, withFlutterFontCsp } from "./build.js";

describe("withFlutterFontCsp", () => {
  it("declares the Noto font CDN on connect + resource when no CSP is given", () => {
    const csp = withFlutterFontCsp();
    expect(csp.connectDomains).toEqual([FLUTTER_FONT_CDN]);
    expect(csp.resourceDomains).toEqual([FLUTTER_FONT_CDN]);
  });

  it("preserves caller origins and de-duplicates the font CDN", () => {
    const csp = withFlutterFontCsp({
      connectDomains: ["https://api.example.com", FLUTTER_FONT_CDN],
      resourceDomains: ["https://cdn.example.com"],
    });
    expect(csp.connectDomains).toEqual(["https://api.example.com", FLUTTER_FONT_CDN]);
    expect(csp.resourceDomains).toEqual(["https://cdn.example.com", FLUTTER_FONT_CDN]);
  });

  it("does not mutate the caller's CSP object", () => {
    const input = { connectDomains: ["https://api.example.com"] };
    withFlutterFontCsp(input);
    expect(input.connectDomains).toEqual(["https://api.example.com"]);
  });

  it("carries through other directives untouched", () => {
    const csp = withFlutterFontCsp({ frameDomains: ["https://frame.example.com"] });
    expect(csp.frameDomains).toEqual(["https://frame.example.com"]);
  });
});

describe("resolveComponentCsp", () => {
  it("allowlists the font CDN by default (includeFontCdn undefined)", () => {
    const csp = resolveComponentCsp(undefined, { connectDomains: ["https://api.example.com"] });
    expect(csp.connectDomains).toEqual(["https://api.example.com", FLUTTER_FONT_CDN]);
    expect(csp.resourceDomains).toEqual([FLUTTER_FONT_CDN]);
  });

  it("allowlists the font CDN when includeFontCdn is true", () => {
    const csp = resolveComponentCsp(true, undefined);
    expect(csp.connectDomains).toEqual([FLUTTER_FONT_CDN]);
  });

  it("omits the font CDN when includeFontCdn is false", () => {
    const csp = resolveComponentCsp(false, { connectDomains: ["https://api.example.com"] });
    expect(csp.connectDomains).toEqual(["https://api.example.com"]);
    expect(csp.resourceDomains).toBeUndefined();
  });

  it("returns an empty CSP when includeFontCdn is false and none is given", () => {
    expect(resolveComponentCsp(false, undefined)).toEqual({});
  });
});

describe("slug", () => {
  it("derives a filesystem-safe slug from a ui:// uri", () => {
    expect(slug("ui://weather-app/get_weather")).toBe("weather-app-get-weather");
  });

  it("falls back to 'app' when nothing usable remains", () => {
    expect(slug("ui://")).toBe("app");
  });
});
