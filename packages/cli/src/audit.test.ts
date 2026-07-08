import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type Check,
  cspShapeCheck,
  flutterArtifactChecks,
  loadApp,
  originAllowed,
  staticConfigChecks,
  staticToolChecks,
} from "./audit.js";
import { jitiFor } from "./commands.js";
import type { McpAppConfig } from "./config.js";

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

describe("cspShapeCheck", () => {
  it("passes a well-formed CSP", () => {
    const checks: Check[] = [];
    cspShapeCheck(
      "scope",
      { connectDomains: ["https://api.example.com"], resourceDomains: ["https://*.cdn.com"] },
      checks,
    );
    expect(checks).toEqual([]);
  });

  it("fails on an unknown directive", () => {
    const checks: Check[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: exercising an invalid shape on purpose
    cspShapeCheck("scope", { workerSrc: ["https://x.com"] } as any, checks);
    expect(checks[0]?.status).toBe("fail");
    expect(checks[0]?.detail).toContain("unknown directive");
  });

  it("fails when a bucket isn't an array of strings", () => {
    const checks: Check[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: exercising an invalid shape on purpose
    cspShapeCheck("scope", { connectDomains: "https://x.com" } as any, checks);
    expect(checks[0]?.status).toBe("fail");
    expect(checks[0]?.detail).toContain("array of origin strings");
  });

  it.each([
    ["*"],
    ["data:"],
    ["'unsafe-inline'"],
    ["https://"],
    ["not-a-url"],
  ])("fails on invalid origin syntax %s", (origin) => {
    const checks: Check[] = [];
    cspShapeCheck("scope", { connectDomains: [origin] }, checks);
    expect(checks[0]?.status).toBe("fail");
    expect(checks[0]?.detail).toContain("invalid origin");
  });

  it("accepts a wildcard-subdomain origin", () => {
    const checks: Check[] = [];
    cspShapeCheck("scope", { connectDomains: ["https://*.example.com"] }, checks);
    expect(checks).toEqual([]);
  });

  it("accepts an origin with non-lowercase scheme/host", () => {
    const checks: Check[] = [];
    cspShapeCheck("scope", { connectDomains: ["https://API.Example.com"] }, checks);
    expect(checks).toEqual([]);
  });
});

describe("staticConfigChecks", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "mcpapps-audit-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("passes a well-formed config with an existing entry file", async () => {
    await writeFile(join(dir, "Card.vue"), "<template/>");
    const checks: Check[] = [];
    const config: McpAppConfig = {
      renderer: "vue",
      app: "./src/app.ts",
      components: [{ name: "card", entry: "./Card.vue", uri: "ui://app/card" }],
    };
    staticConfigChecks(config, dir, checks);
    expect(checks.some((c) => c.status === "fail")).toBe(false);
  });

  it("fails on an unknown renderer", () => {
    const checks: Check[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: exercising an invalid shape on purpose
    staticConfigChecks({ renderer: "svelte", app: "./src/app.ts" } as any, dir, checks);
    expect(checks[0]?.status).toBe("fail");
    expect(checks[0]?.detail).toContain('expected "vue" or "flutter"');
  });

  it("fails when a component is missing a name", () => {
    const checks: Check[] = [];
    const config: McpAppConfig = {
      renderer: "vue",
      app: "./src/app.ts",
      // biome-ignore lint/suspicious/noExplicitAny: exercising an invalid shape on purpose
      components: [{ entry: "./Card.vue", uri: "ui://app/card" } as any],
    };
    staticConfigChecks(config, dir, checks);
    expect(checks.some((c) => c.label.includes("name") && c.status === "fail")).toBe(true);
  });

  it("fails on a non-ui:// component uri", () => {
    const checks: Check[] = [];
    const config: McpAppConfig = {
      renderer: "vue",
      app: "./src/app.ts",
      components: [{ name: "card", entry: "./Card.vue", uri: "not-a-ui-uri" }],
    };
    staticConfigChecks(config, dir, checks);
    expect(checks.some((c) => c.label.includes("uri") && c.status === "fail")).toBe(true);
  });

  it("fails when the entry file doesn't exist", () => {
    const checks: Check[] = [];
    const config: McpAppConfig = {
      renderer: "vue",
      app: "./src/app.ts",
      components: [{ name: "card", entry: "./missing.vue", uri: "ui://app/card" }],
    };
    staticConfigChecks(config, dir, checks);
    expect(checks.some((c) => c.label.includes("entry") && c.status === "fail")).toBe(true);
  });
});

describe("staticToolChecks", () => {
  it("passes a well-formed tool", () => {
    const checks: Check[] = [];
    staticToolChecks(
      {
        name: "app",
        renderer: "vue",
        resourceMap: new Map(),
        tools: [
          {
            name: "get_weather",
            inputSchema: {},
            outputSchema: {},
            ui: { uri: "ui://app/x", html: "<div/>" },
          },
        ],
      },
      checks,
    );
    expect(checks.some((c) => c.status === "fail")).toBe(false);
    expect(checks.some((c) => c.label === "tool get_weather: ok")).toBe(true);
  });

  it("fails when the app defines no tools", () => {
    const checks: Check[] = [];
    staticToolChecks({ name: "app", renderer: "vue", resourceMap: new Map(), tools: [] }, checks);
    expect(checks[0]?.status).toBe("fail");
    expect(checks[0]?.detail).toContain("no tools");
  });

  it("fails on a tool name that doesn't match the allowed pattern", () => {
    const checks: Check[] = [];
    staticToolChecks(
      {
        name: "app",
        renderer: "vue",
        resourceMap: new Map(),
        tools: [{ name: "bad name!", inputSchema: {}, outputSchema: {} }],
      },
      checks,
    );
    expect(checks.some((c) => c.label.includes("name") && c.status === "fail")).toBe(true);
  });

  it("fails when input/output schemas are missing", () => {
    const checks: Check[] = [];
    staticToolChecks(
      { name: "app", renderer: "vue", resourceMap: new Map(), tools: [{ name: "x" }] },
      checks,
    );
    expect(checks.some((c) => c.label.includes("schemas") && c.status === "fail")).toBe(true);
  });

  it("fails on a non-ui:// tool.ui.uri", () => {
    const checks: Check[] = [];
    staticToolChecks(
      {
        name: "app",
        renderer: "vue",
        resourceMap: new Map(),
        tools: [
          {
            name: "x",
            inputSchema: {},
            outputSchema: {},
            ui: { uri: "not-a-uri", html: "<div/>" },
          },
        ],
      },
      checks,
    );
    expect(checks.some((c) => c.label.includes("ui.uri") && c.status === "fail")).toBe(true);
  });

  it("fails when the ui component has no body", () => {
    const checks: Check[] = [];
    staticToolChecks(
      {
        name: "app",
        renderer: "vue",
        resourceMap: new Map(),
        tools: [{ name: "x", inputSchema: {}, outputSchema: {}, ui: { uri: "ui://app/x" } }],
      },
      checks,
    );
    expect(checks.some((c) => c.label.includes("ui body") && c.status === "fail")).toBe(true);
  });

  it("rejects a basePath-only component when targeting claude", () => {
    const checks: Check[] = [];
    staticToolChecks(
      {
        name: "app",
        renderer: "flutter",
        resourceMap: new Map(),
        tools: [
          {
            name: "x",
            inputSchema: {},
            outputSchema: {},
            ui: { uri: "ui://app/x", basePath: "/_c/x/" },
          },
        ],
      },
      checks,
      ["claude"],
    );
    expect(checks.some((c) => c.label === "claude: tool x: ui body" && c.status === "fail")).toBe(
      true,
    );
  });

  it("does not reject a basePath-only component when claude isn't targeted", () => {
    const checks: Check[] = [];
    staticToolChecks(
      {
        name: "app",
        renderer: "flutter",
        resourceMap: new Map(),
        tools: [
          {
            name: "x",
            inputSchema: {},
            outputSchema: {},
            ui: { uri: "ui://app/x", basePath: "/_c/x/" },
          },
        ],
      },
      checks,
      ["chatgpt"],
    );
    expect(checks.some((c) => c.label === "claude: tool x: ui body")).toBe(false);
  });

  it("warns when frameDomains/baseUriDomains are declared while targeting chatgpt", () => {
    const checks: Check[] = [];
    staticToolChecks(
      {
        name: "app",
        renderer: "vue",
        resourceMap: new Map(),
        tools: [
          {
            name: "x",
            inputSchema: {},
            outputSchema: {},
            ui: {
              uri: "ui://app/x",
              html: "<div/>",
              csp: { frameDomains: ["https://embed.example.com"] },
            },
          },
        ],
      },
      checks,
      ["chatgpt"],
    );
    const warning = checks.find((c) => c.label === "chatgpt: tool x: csp");
    expect(warning?.status).toBe("warn");
    expect(warning?.detail).toContain("frameDomains");
  });
});

describe("flutterArtifactChecks", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "mcpapps-audit-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("passes when component-meta.ts exists", async () => {
    await mkdir(join(dir, "src/generated"), { recursive: true });
    await writeFile(join(dir, "src/generated/component-meta.ts"), "export {};");
    const checks: Check[] = [];
    flutterArtifactChecks(dir, checks);
    expect(checks[0]?.status).toBe("pass");
  });

  it("warns when component-meta.ts is missing", () => {
    const checks: Check[] = [];
    flutterArtifactChecks(dir, checks);
    expect(checks[0]?.status).toBe("warn");
  });
});

describe("loadApp", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "mcpapps-audit-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("loads a module that exports `app`", async () => {
    const entry = join(dir, "app.ts");
    await writeFile(
      entry,
      'export const app = { name: "x", renderer: "vue", resourceMap: new Map(), tools: [] };',
    );
    const checks: Check[] = [];
    const app = await loadApp(entry, jitiFor(dir), checks);
    expect(app?.name).toBe("x");
    expect(checks.some((c) => c.status === "pass")).toBe(true);
  });

  it("fails when the module doesn't export `app`", async () => {
    const entry = join(dir, "app.ts");
    await writeFile(entry, "export const notApp = {};");
    const checks: Check[] = [];
    const app = await loadApp(entry, jitiFor(dir), checks);
    expect(app).toBeNull();
    expect(checks[0]?.status).toBe("fail");
  });

  it("fails when the entry file doesn't exist", async () => {
    const checks: Check[] = [];
    const app = await loadApp(join(dir, "missing.ts"), jitiFor(dir), checks);
    expect(app).toBeNull();
    expect(checks[0]?.status).toBe("fail");
  });
});
