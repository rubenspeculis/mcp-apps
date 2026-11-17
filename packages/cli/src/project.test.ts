import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditCommand } from "./audit.js";

const launchBrowser = vi.hoisted(() => vi.fn());
vi.mock("playwright", () => ({ chromium: { launch: launchBrowser } }));

// A project-local compiler adapter exercises real module resolution and generated
// imports without making every preparation test run Vite or the Flutter SDK.
const COMPILER = `import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
export async function writeComponentsModule(specs, output, { root }) {
  const control = globalThis["mcpapps-test-compiler:" + root];
  if (control) return control();
  await appendFile(join(root, "build.log"), "build\\n");
  const resources = [];
  for (const spec of specs) {
    const body = await readFile(spec.entry, "utf8");
    if (body === "broken") throw new Error("fixture compilation failed");
    resources.push({ uri: spec.uri, ...JSON.parse(body) });
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, specs.map((spec, i) =>
    "export const " + spec.name + " = " + JSON.stringify(resources[i]) + ";"
  ).join("\\n"));
  return resources;
}`;

const CONFIG = `export default {
  renderer: "vue", app: "src/app.ts",
  components: [{ name: "card", entry: "Card.vue", uri: "ui://test/card" }]
};`;
const APP = `import { card } from "./generated/components.js";
const schema = { toJSONSchema() { return { type: "object" }; } };
const first = { name: "show", inputSchema: schema, outputSchema: schema, ui: card };
const second = { ...first, name: "show_again" };
export const app = {
  name: "fixture", renderer: "vue", tools: [first, second],
  resourceMap: new Map([[card.uri, card]])
};`;

let dir: string;
let previousExitCode: typeof process.exitCode;

async function setResource(html: string, extra: Record<string, unknown> = {}): Promise<void> {
  await writeFile(join(dir, "Card.vue"), JSON.stringify({ html, ...extra }));
}

async function addDetailResource(): Promise<void> {
  await writeFile(
    join(dir, "mcpapps.config.ts"),
    `export default ${JSON.stringify({
      renderer: "vue",
      app: "src/app.ts",
      components: [
        { name: "card", entry: "Card.vue", uri: "ui://test/card" },
        { name: "detail", entry: "Detail.vue", uri: "ui://test/detail" },
      ],
    })};`,
  );
  await writeFile(
    join(dir, "src/app.ts"),
    `
import { card, detail } from "./generated/components.js";
const tools = [card, detail].map((ui, index) => ({
  name: "show_" + index, inputSchema: {}, outputSchema: {}, ui,
}));
export const app = {
  name: "fixture", renderer: "vue", tools,
  resourceMap: new Map(tools.map((tool) => [tool.ui.uri, tool.ui])),
};`,
  );
  await writeFile(
    join(dir, "Detail.vue"),
    JSON.stringify({
      html: "detail before",
      csp: { connectDomains: ["https://detail-before.example.com"] },
    }),
  );
}

function signal() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function buildCount(): Promise<number> {
  return (await readFile(join(dir, "build.log"), "utf8")).trim().split("\n").length;
}

async function browserFixture(requestUrls: string[]) {
  const dev = join(dir, "node_modules/@mcpapps/dev");
  await mkdir(dev, { recursive: true });
  await writeFile(
    join(dev, "package.json"),
    JSON.stringify({
      name: "@mcpapps/dev",
      type: "module",
      exports: "./index.mjs",
    }),
  );
  await writeFile(
    join(dev, "index.mjs"),
    `import { appendFile } from "node:fs/promises";
const trace = new URL("../../../emulator.log", import.meta.url);
export async function serveEmulator() {
  await appendFile(trace, "start\\n");
  return { url: "http://127.0.0.1:9876", close: () => appendFile(trace, "close\\n") };
}`,
  );
  let onRequest: ((request: { url(): string }) => void) | undefined;
  const page = {
    on(event: string, callback: (request: { url(): string }) => void) {
      if (event === "request") onRequest = callback;
    },
    goto: vi.fn(async () => {
      for (const url of requestUrls) onRequest?.({ url: () => url });
    }),
    waitForFunction: vi.fn().mockResolvedValue(null),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    selectOption: vi.fn().mockResolvedValue(null),
    click: vi.fn().mockResolvedValue(null),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const browser = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
  launchBrowser.mockResolvedValue(browser);
  return browser;
}

beforeEach(async () => {
  previousExitCode = process.exitCode;
  process.exitCode = 0;
  launchBrowser.mockReset();
  dir = await mkdtemp(join(tmpdir(), "mcpapps-project-"));
  const compiler = join(dir, "node_modules/@mcpapps/vite-plugin-vue");
  await mkdir(compiler, { recursive: true });
  await writeFile(
    join(compiler, "package.json"),
    JSON.stringify({ name: "@mcpapps/vite-plugin-vue", type: "module", exports: "./index.mjs" }),
  );
  await writeFile(join(compiler, "index.mjs"), COMPILER);
  await mkdir(join(dir, "src"));
  await writeFile(join(dir, "mcpapps.config.ts"), CONFIG);
  await writeFile(join(dir, "src/app.ts"), APP);
  await setResource("<h1>Fresh</h1>");
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.exitCode = previousExitCode;
  await rm(dir, { recursive: true, force: true });
});

describe("audit project preparation", () => {
  it("static-only compiles missing Vue output before loading the app, without a browser", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await auditCommand(["--static-only"]);

    expect(error.mock.calls).toEqual([]);
    expect(process.exitCode).toBe(0);
    expect(await readFile(join(dir, "src/generated/components.ts"), "utf8")).toContain("Fresh");
    expect(await buildCount()).toBe(1);
    expect(launchBrowser).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join("\n")).toContain("runtime: skipped (--static-only)");
  });

  it("static-only validates freshly compiled metadata instead of stale generated metadata", async () => {
    await mkdir(join(dir, "src/generated"));
    await writeFile(
      join(dir, "src/generated/components.ts"),
      'export const card = { uri: "ui://test/card", html: "old" };',
    );
    await setResource("fresh", { csp: { connectDomains: ["*"] } });
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await auditCommand(["--static-only"]);

    expect(process.exitCode).toBe(1);
    expect(error.mock.calls.flat().join("\n")).toContain("invalid origin");
    expect(await buildCount()).toBe(1);
  });

  it("reports compilation errors as failed checks without trying to import stale output", async () => {
    await writeFile(join(dir, "Card.vue"), "broken");
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(auditCommand(["--static-only"])).resolves.toBeUndefined();

    expect(process.exitCode).toBe(1);
    expect(error.mock.calls.flat().join("\n")).toContain("fixture compilation failed");
    expect(error.mock.calls.flat().join("\n")).not.toContain("Cannot find module");
  });
});

describe("runtime audit preparation", () => {
  it("compiles once and matches requests against the prepared CSP", async () => {
    const browser = await browserFixture(["https://api.example.com"]);
    await setResource("fresh", { csp: { connectDomains: ["HTTPS://API.Example.com:443"] } });
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await auditCommand(["--runtime"]);

    expect(error.mock.calls).toEqual([]);
    expect(process.exitCode).toBe(0);
    expect(await buildCount()).toBe(1);
    expect(browser.newPage).toHaveBeenCalledTimes(2);
    expect(browser.close).toHaveBeenCalledOnce();
    expect(await readFile(join(dir, "emulator.log"), "utf8")).toBe("start\nclose\n");
  });

  it("reports wildcard scheme downgrades as CSP drift", async () => {
    await browserFixture(["http://api.example.com"]);
    await setResource("fresh", { csp: { connectDomains: ["https://*.example.com"] } });
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await auditCommand(["--runtime"]);

    expect(process.exitCode).toBe(1);
    expect(error.mock.calls.flat().join("\n")).toContain(
      "contacted undeclared origins: http://api.example.com",
    );
  });

  it("closes the emulator when the browser cannot launch", async () => {
    await browserFixture([]);
    launchBrowser.mockRejectedValueOnce(new Error("browser unavailable"));
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await auditCommand(["--runtime"]);

    expect(process.exitCode).toBe(1);
    expect(error.mock.calls.flat().join("\n")).toContain("browser unavailable");
    expect(await readFile(join(dir, "emulator.log"), "utf8")).toBe("start\nclose\n");
  });
});

describe("prepared app", () => {
  it("builds without importing the app", async () => {
    const { buildProject } = await import("./project.js");
    await writeFile(join(dir, "src/app.ts"), 'throw new Error("app must not be imported");');

    await buildProject(dir);

    expect(await buildCount()).toBe(1);
    expect(await readFile(join(dir, "src/generated/components.ts"), "utf8")).toContain("Fresh");
  });

  it("loads after compilation and shares one current resource across all referencing tools", async () => {
    const { prepareProject } = await import("./project.js");
    const prepared = await prepareProject(dir);
    const resource = prepared.app.resourceMap.get("ui://test/card");

    expect(resource?.html).toBe("<h1>Fresh</h1>");
    expect(prepared.app.tools?.map((tool) => tool.ui)).toEqual([resource, resource]);
    expect(prepared.app.tools?.every((tool) => tool.ui === resource)).toBe(true);
    expect(prepared.watchPaths).toEqual([join(dir, "Card.vue")]);
    expect(await buildCount()).toBe(1);
  });

  it("refreshes HTML and metadata together, including removal of old metadata", async () => {
    const { prepareProject } = await import("./project.js");
    await setResource("old", {
      csp: { connectDomains: ["https://old.example.com"] },
      domain: "https://old.example.com",
      prefersBorder: true,
    });
    const prepared = await prepareProject(dir);
    await setResource("new", { csp: { connectDomains: ["https://new.example.com"] } });

    await prepared.rebuild();

    const resource = prepared.app.resourceMap.get("ui://test/card");
    expect(resource?.html).toBe("new");
    expect(resource?.csp?.connectDomains).toEqual(["https://new.example.com"]);
    expect(resource).not.toHaveProperty("domain");
    expect(resource).not.toHaveProperty("prefersBorder");
    expect(prepared.app.tools?.every((tool) => tool.ui === resource)).toBe(true);
    expect(await buildCount()).toBe(2);
  });

  it("retains the last successful app after a failed rebuild and can recover", async () => {
    const { prepareProject } = await import("./project.js");
    const prepared = await prepareProject(dir);
    const previous = prepared.app.resourceMap.get("ui://test/card");
    const generated = await readFile(join(dir, "src/generated/components.ts"), "utf8");
    await writeFile(join(dir, "Card.vue"), "broken");

    await expect(prepared.rebuild()).rejects.toThrow("fixture compilation failed");

    expect(prepared.app.resourceMap.get("ui://test/card")).toBe(previous);
    expect(prepared.app.tools?.every((tool) => tool.ui === previous)).toBe(true);
    expect(await readFile(join(dir, "src/generated/components.ts"), "utf8")).toBe(generated);
    await setResource("recovered");
    await prepared.rebuild();
    expect(prepared.app.resourceMap.get("ui://test/card")?.html).toBe("recovered");
  });

  it("preserves the entire last build when a later resource fails to compile", async () => {
    const { prepareProject } = await import("./project.js");
    await addDetailResource();
    await setResource("card before", {
      csp: { connectDomains: ["https://card-before.example.com"] },
    });
    const prepared = await prepareProject(dir);
    const generated = await readFile(join(dir, "src/generated/components.ts"), "utf8");
    await setResource("card after", {
      csp: { connectDomains: ["https://card-after.example.com"] },
    });
    await writeFile(join(dir, "Detail.vue"), "broken");

    await expect(prepared.rebuild()).rejects.toThrow("fixture compilation failed");

    const resources = [
      {
        uri: "ui://test/card",
        html: "card before",
        csp: { connectDomains: ["https://card-before.example.com"] },
      },
      {
        uri: "ui://test/detail",
        html: "detail before",
        csp: { connectDomains: ["https://detail-before.example.com"] },
      },
    ];
    expect([...prepared.app.resourceMap.values()]).toEqual(resources);
    expect(prepared.app.tools?.map((tool) => tool.ui)).toEqual(resources);
    expect(await readFile(join(dir, "src/generated/components.ts"), "utf8")).toBe(generated);
  });

  it.each([
    [
      "missing resources",
      [
        {
          uri: "ui://test/card",
          html: "unpublished card",
          csp: { connectDomains: ["https://unpublished.example.com"] },
        },
      ],
    ],
    [
      "a mismatched resource URI",
      [
        {
          uri: "ui://test/card",
          html: "unpublished card",
          csp: { connectDomains: ["https://unpublished.example.com"] },
        },
        { uri: "ui://test/unexpected", html: "unpublished detail" },
      ],
    ],
  ])("rejects %s without changing the prepared app", async (_label, output) => {
    const { prepareProject } = await import("./project.js");
    await addDetailResource();
    const prepared = await prepareProject(dir);
    const previousResources = structuredClone([...prepared.app.resourceMap.entries()]);
    const previousToolResources = structuredClone(prepared.app.tools?.map((tool) => tool.ui));
    vi.stubGlobal(`mcpapps-test-compiler:${dir}`, async () => output);

    await expect(prepared.rebuild()).rejects.toThrow(
      "Compiler output does not match the declared UI resources",
    );

    expect([...prepared.app.resourceMap.entries()]).toEqual(previousResources);
    expect(prepared.app.tools?.map((tool) => tool.ui)).toEqual(previousToolResources);
  });

  it("keeps the newest resources when rebuild requests overlap", async () => {
    const { prepareProject } = await import("./project.js");
    const prepared = await prepareProject(dir);
    const olderStarted = signal();
    const releaseOlder = signal();
    let compilation = 0;
    vi.stubGlobal(`mcpapps-test-compiler:${dir}`, async () => {
      if (compilation++ === 0) {
        olderStarted.release();
        await releaseOlder.promise;
        return [
          {
            uri: "ui://test/card",
            html: "older",
            csp: { connectDomains: ["https://older.example.com"] },
          },
        ];
      }
      return [
        {
          uri: "ui://test/card",
          html: "newest",
          csp: { connectDomains: ["https://newest.example.com"] },
        },
      ];
    });

    const older = prepared.rebuild();
    await olderStarted.promise;
    const newer = prepared.rebuild();
    try {
      // Let an incorrectly concurrent compilation finish while the older one is
      // held at an explicit gate; no elapsed-time ordering assumption is needed.
      await new Promise<void>((resolve) => setImmediate(resolve));
    } finally {
      releaseOlder.release();
      await Promise.all([older, newer]);
    }

    const resource = prepared.app.resourceMap.get("ui://test/card");
    expect(resource).toEqual({
      uri: "ui://test/card",
      html: "newest",
      csp: { connectDomains: ["https://newest.example.com"] },
    });
    expect(prepared.app.tools?.every((tool) => tool.ui === resource)).toBe(true);
  });

  it("serves refreshed HTML and tool metadata through the same running handler", async () => {
    const { prepareProject, jitiFor } = await import("./project.js");
    const prepared = await prepareProject(dir);
    const { createMcpHandler } = await jitiFor(dir).import<{
      createMcpHandler(app: unknown): (request: Request) => Promise<Response>;
    }>(fileURLToPath(new URL("../../server/src/mcp-handler.ts", import.meta.url)));
    const handler = createMcpHandler(prepared.app);
    const rpc = async (method: string, params = {}) =>
      (
        await handler(
          new Request("https://example.com/mcp", {
            method: "POST",
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          }),
        )
      ).json();
    expect(await rpc("resources/read", { uri: "ui://test/card" })).toMatchObject({
      result: { contents: [{ text: "<h1>Fresh</h1>" }] },
    });
    await setResource("updated", { csp: { connectDomains: ["https://updated.example.com"] } });

    await prepared.rebuild();

    expect(await rpc("resources/read", { uri: "ui://test/card" })).toMatchObject({
      result: {
        contents: [
          {
            text: "updated",
            _meta: {
              ui: { csp: { connectDomains: ["https://updated.example.com"] } },
            },
          },
        ],
      },
    });
    expect(await rpc("tools/list")).toMatchObject({
      result: {
        tools: [
          { _meta: { ui: { csp: { connectDomains: ["https://updated.example.com"] } } } },
          { _meta: { ui: { csp: { connectDomains: ["https://updated.example.com"] } } } },
        ],
      },
    });
  });

  it("loads pre-built Flutter without invoking a compiler", async () => {
    const { prepareProject } = await import("./project.js");
    await rm(join(dir, "mcpapps.config.ts"));
    await writeFile(
      join(dir, "src/worker.ts"),
      'export const app = { name: "flutter", renderer: "flutter", tools: [], resourceMap: new Map() };',
    );

    const prepared = await prepareProject(dir);
    await prepared.rebuild();

    expect(prepared.app.renderer).toBe("flutter");
    expect(prepared.watchPaths).toEqual([]);
    await expect(readFile(join(dir, "build.log"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects unsupported dev renderers before executing their app module", async () => {
    const { devCommand } = await import("./commands.js");
    await writeFile(join(dir, "mcpapps.config.ts"), CONFIG.replace('"vue"', '"flutter"'));
    await writeFile(join(dir, "src/app.ts"), 'throw new Error("must not execute");');
    vi.spyOn(process, "cwd").mockReturnValue(dir);

    await expect(devCommand()).rejects.toThrow("supports the vue renderer");
    await expect(readFile(join(dir, "build.log"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("explains the explicit build requirement when Flutter generated output is missing", async () => {
    const { prepareProject } = await import("./project.js");
    await rm(join(dir, "mcpapps.config.ts"));
    await writeFile(
      join(dir, "src/worker.ts"),
      'import { uri } from "./generated/component-meta.js"; export const app = { name: uri };',
    );

    await expect(prepareProject(dir)).rejects.toThrow(/Flutter.*build/i);
    await expect(readFile(join(dir, "build.log"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
