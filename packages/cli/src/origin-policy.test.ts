import { describe, expect, it } from "vitest";
import { createOriginPolicy } from "./origin-policy.js";

describe("createOriginPolicy", () => {
  it("matches exact origin declarations after normalising case and default ports", () => {
    const policy = createOriginPolicy(["HTTPS://API.Example.com:443", "HTTP://LOCALHOST:80"]);

    expect(policy.invalid).toEqual([]);
    expect(policy.allows("https://api.example.com")).toBe(true);
    expect(policy.allows("HTTPS://Api.Example.Com:443")).toBe(true);
    expect(policy.allows("http://localhost")).toBe(true);
    expect(policy.allows("https://other.example.com")).toBe(false);
    expect(policy.allows("https://deep.api.example.com")).toBe(false);
    expect(policy.allows("https://example.com")).toBe(false);
    expect(policy.allows("http://api.example.com:443")).toBe(false);
    expect(policy.allows("https://api.example.com:8443")).toBe(false);
  });

  it.each([
    ["https://*.example.com", "https://example.com", "https://api.example.com", true],
    ["https://*.example.com", "https://example.com:443", "https://api.example.com:443", true],
    ["HTTPS://*.Example.COM:443", "https://example.com", "https://Deep.API.Example.com:443", true],
    ["http://*.example.com:80", "http://example.com", "HTTP://Deep.API.Example.com:80", true],
    [
      "https://*.example.com:8443",
      "https://example.com:8443",
      "https://api.example.com:8443",
      true,
    ],
    ["https://*.example.com", "http://example.com", "http://api.example.com", false],
    ["https://*.example.com:443", "http://example.com:443", "http://api.example.com:443", false],
    ["http://*.example.com", "https://example.com", "https://api.example.com", false],
    ["https://*.example.com", "https://example.com:8443", "https://api.example.com:8443", false],
    ["https://*.example.com:8443", "https://example.com", "https://api.example.com", false],
    ["https://*.example.com", "https://notexample.com", "https://api.notexample.com", false],
    ["https://*.example.com", "https://example.com.evil.test", "https://example.org", false],
  ])("applies wildcard declaration %s to %s and %s: %s", (declaration, apex, subdomain, allowed) => {
    const policy = createOriginPolicy([declaration]);

    expect(policy.invalid).toEqual([]);
    expect(policy.allows(apex)).toBe(allowed);
    expect(policy.allows(subdomain)).toBe(allowed);
  });

  it.each([
    "https://example.com",
    "https://*.example.com",
  ])("rejects URL-only syntax in origin declaration %s", (origin) => {
    const invalid = [
      `${origin}/`,
      `${origin}/path`,
      `${origin}/..`,
      `${origin}?`,
      `${origin}?query=value`,
      `${origin}#`,
      `${origin}#fragment`,
      `${origin}\\path`,
      `${origin}:`,
      `${origin}:abc`,
      `${origin}:-1`,
      `${origin}:65536`,
      ` ${origin}`,
      `${origin} `,
      `${origin}\n`,
      `${origin}\u0000`,
      origin.replace("example", "exam\tple"),
      origin.replace("//", "//user:secret@"),
      origin.replace("//", "//@"),
    ];

    expect(createOriginPolicy(invalid).invalid).toEqual(invalid);
  });

  it.each([
    "",
    "*",
    "not-a-url",
    "https:",
    "https://",
    "https:///example.com",
    "https:example.com",
    "//example.com",
    "data:",
    "'unsafe-inline'",
    "ftp://example.com",
    "ws://example.com",
    "wss://example.com",
    "https://*",
    "https://*example.com",
    "https://api.*.com",
    "https://*.*.example.com",
    "https://example.com:*",
    "https://[:::1]",
    "https://%2A.example.com",
    "https://＊.example.com",
  ])("retains malformed or unsupported origin declaration %j as invalid", (declaration) => {
    const policy = createOriginPolicy([declaration]);

    expect(policy.invalid).toEqual([declaration]);
    expect(policy.allows("https://example.com")).toBe(false);
  });

  it.each([
    ["http://127.0.0.1:80", "HTTP://127.0.0.1"],
    ["https://[::1]:443", "HTTPS://[::1]"],
    ["https://api.example.com:8443", "https://API.Example.com:8443"],
  ])("matches exact origin declaration %s to %s", (declaration, origin) => {
    const policy = createOriginPolicy([declaration]);

    expect(policy.invalid).toEqual([]);
    expect(policy.allows(origin)).toBe(true);
    expect(policy.allows("https://api.example.com")).toBe(false);
  });

  it("treats an empty list of origin declarations as deny-all", () => {
    const policy = createOriginPolicy([]);

    expect(policy.invalid).toEqual([]);
    expect(policy.allows("https://example.com")).toBe(false);
    expect(policy.allows("http://localhost:8080")).toBe(false);
  });

  it("retains invalid declarations verbatim, in order, without discarding valid rules", () => {
    const declarations = [
      "https://api.example.com",
      " HTTPS://Bad.Example.com ",
      "https://*.cdn.example.com:443",
      "https://bad.example.com/path",
      " HTTPS://Bad.Example.com ",
    ] as const;
    const policy = createOriginPolicy(declarations);

    expect(policy.invalid).toEqual([
      " HTTPS://Bad.Example.com ",
      "https://bad.example.com/path",
      " HTTPS://Bad.Example.com ",
    ]);
    expect(policy.allows("https://API.Example.com:443")).toBe(true);
    expect(policy.allows("https://deep.assets.cdn.example.com")).toBe(true);
    expect(policy.allows("https://bad.example.com")).toBe(false);
  });

  it("compiles declarations independently of later changes to the input array", () => {
    const declarations = ["https://api.example.com", "https://*.cdn.example.com"];
    const policy = createOriginPolicy(declarations);
    declarations.splice(0, declarations.length, "https://other.example.com");

    expect(policy.allows("https://api.example.com")).toBe(true);
    expect(policy.allows("https://assets.cdn.example.com")).toBe(true);
    expect(policy.allows("https://other.example.com")).toBe(false);
  });

  it.each([
    "https://example.com",
    "https://*.example.com",
  ])("denies malformed origin input even with a matching declaration %s", (declaration) => {
    const policy = createOriginPolicy([declaration]);
    for (const origin of [
      "https://example.com/",
      "https://example.com/path",
      "https://example.com?",
      "https://example.com#",
      "https://user:secret@example.com",
      "https://@example.com",
      "https://example.com:",
      "https:///example.com",
      "https:example.com",
      " https://example.com",
      "https://example.com\n",
      "https://example.com\u0000",
      "https://exam\tple.com",
      "https://example.com\\path",
      "https://*.example.com",
      "https://＊.example.com",
      "wss://example.com",
      "null",
      "not-a-url",
      "",
    ]) {
      expect(policy.allows(origin), origin).toBe(false);
    }
  });
});
