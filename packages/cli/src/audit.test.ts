import { describe, expect, it } from "vitest";
import { originAllowed } from "./audit.js";

describe("originAllowed", () => {
  it("matches exact declared origins", () => {
    const declared = new Set(["https://api.example.com"]);
    expect(originAllowed("https://api.example.com", declared)).toBe(true);
    expect(originAllowed("https://other.example.com", declared)).toBe(false);
  });

  it("matches wildcard subdomains and the bare apex", () => {
    const declared = new Set(["https://*.example.com"]);
    expect(originAllowed("https://api.example.com", declared)).toBe(true);
    expect(originAllowed("https://deep.api.example.com", declared)).toBe(true);
    expect(originAllowed("https://example.com", declared)).toBe(true);
    expect(originAllowed("https://example.org", declared)).toBe(false);
    expect(originAllowed("https://notexample.com", declared)).toBe(false);
  });

  it("treats an empty allowlist as deny-all", () => {
    expect(originAllowed("https://api.example.com", new Set())).toBe(false);
  });
});
