/// <reference lib="dom" />
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "./args.js";
import { generatedPath, jitiFor, loadConfig, specsFor } from "./commands.js";
import type { McpAppConfig, McpUiResourceCsp } from "./config.js";

// --- Minimal structural shapes for the project-local modules loaded via jiti ---

type CompiledComponentLike = {
  uri: string;
  html?: string;
  htmlAsset?: string;
  basePath?: string;
  assets?: Record<string, unknown>;
  csp?: McpUiResourceCsp;
};
type ToolLike = {
  name: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  ui?: CompiledComponentLike;
};
type LoadedApp = {
  name: string;
  renderer: string;
  tools?: ToolLike[];
  resourceMap: Map<string, CompiledComponentLike>;
};

// Structural subset of the Playwright API the runtime layer uses. Declared
// locally so `playwright` stays a pure optional runtime dep — no type or install
// coupling for users who only run the static audit.
interface PwPage {
  on(event: "request", cb: (req: { url(): string }) => void): void;
  on(event: "console", cb: (msg: { text(): string }) => void): void;
  goto(url: string, opts?: { waitUntil?: string }): Promise<unknown>;
  waitForFunction(fn: () => unknown, arg?: unknown, opts?: { timeout?: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  selectOption(selector: string, value: string): Promise<unknown>;
  click(selector: string): Promise<unknown>;
  close(): Promise<void>;
}
interface PwBrowser {
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
}
interface PwModule {
  chromium: { launch: () => Promise<PwBrowser> };
}

type CheckStatus = "pass" | "fail" | "warn" | "skip";
interface Check {
  label: string;
  status: CheckStatus;
  detail?: string;
}

const ICON: Record<CheckStatus, string> = { pass: "✓", fail: "✗", warn: "!", skip: "·" };
const CSP_BUCKETS = ["connectDomains", "resourceDomains", "frameDomains", "baseUriDomains"];
const TOOL_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const UI_URI_RE = /^ui:\/\/.+/;

/**
 * `mcpapps audit [--static-only] [--runtime] [--port N]` — a skybridge-style
 * conformance check developers run before publishing. Static validation always
 * runs; the headless-browser runtime pass runs by default (and is required by
 * `--runtime`, skipped by `--static-only`). Exits non-zero on any failure so it
 * is CI-usable.
 */
export async function auditCommand(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);
  const staticOnly = flags["static-only"] === true;
  const forceRuntime = flags.runtime === true;
  const port = typeof flags.port === "string" ? Number(flags.port) : undefined;

  const cwd = process.cwd();
  const hasConfig = existsSync(resolve(cwd, "mcpapps.config.ts"));
  const workerEntry = resolve(cwd, "src/worker.ts");
  const isFlutterProject = !hasConfig && existsSync(workerEntry);
  if (!hasConfig && !isFlutterProject) {
    console.error(
      "Not an MCP App project — expected mcpapps.config.ts (vue) or src/worker.ts (flutter).",
    );
    process.exitCode = 1;
    return;
  }

  const checks: Check[] = [];
  const jiti = jitiFor(cwd);

  // --- Layer A: static validation (no browser) ---
  // Vue declares components in mcpapps.config.ts; Flutter has none — its single
  // component is wired up in src/worker.ts and built by src/pre-deploy.ts.
  const config = hasConfig ? await loadConfig(cwd, jiti) : undefined;
  if (config) staticConfigChecks(config, cwd, checks);
  const appEntry = config ? resolve(cwd, config.app) : workerEntry;
  const app = await loadApp(appEntry, jiti, checks);
  if (app) {
    staticToolChecks(app, checks);
    if (isFlutterProject) flutterArtifactChecks(cwd, checks);
  }

  // --- Layer B: headless-browser runtime conformance ---
  if (app && !staticOnly) {
    await runtimeChecks(cwd, jiti, config, app, { port, forceRuntime, checks });
  } else if (staticOnly) {
    checks.push({ label: "runtime: skipped (--static-only)", status: "skip" });
  }

  report(checks);
}

/** Flutter has no central config — verify the build wiring instead. */
function flutterArtifactChecks(cwd: string, checks: Check[]): void {
  const meta = existsSync(resolve(cwd, "src/generated/component-meta.ts"));
  checks.push({
    label: "flutter: generated/component-meta.ts",
    status: meta ? "pass" : "warn",
    ...(meta ? {} : { detail: "run `pnpm build` to generate it" }),
  });
}

function staticConfigChecks(config: McpAppConfig, cwd: string, checks: Check[]): void {
  if (config.renderer === "vue" || config.renderer === "flutter") {
    checks.push({ label: `config: renderer "${config.renderer}"`, status: "pass" });
  } else {
    checks.push({
      label: "config: renderer",
      status: "fail",
      detail: `expected "vue" or "flutter", got "${String(config.renderer)}"`,
    });
  }

  for (const c of config.components ?? []) {
    const id = c.name || c.uri || "<unnamed>";
    if (!c.name) checks.push({ label: `component ${id}: name`, status: "fail", detail: "missing" });
    if (!UI_URI_RE.test(c.uri ?? "")) {
      checks.push({
        label: `component ${id}: uri`,
        status: "fail",
        detail: `"${c.uri}" must match ui://…`,
      });
    }
    if (c.entry && !existsSync(resolve(cwd, c.entry))) {
      checks.push({
        label: `component ${id}: entry`,
        status: "fail",
        detail: `file not found: ${c.entry}`,
      });
    }
    cspShapeCheck(`component ${id}`, c.csp, checks);
    if (c.name && UI_URI_RE.test(c.uri ?? "") && (!c.entry || existsSync(resolve(cwd, c.entry)))) {
      checks.push({ label: `component ${id}: declaration`, status: "pass" });
    }
  }
}

/** CSP must only use the four supported buckets, each an array of origin strings. */
function cspShapeCheck(scope: string, csp: McpUiResourceCsp | undefined, checks: Check[]): void {
  if (!csp) return;
  for (const [key, value] of Object.entries(csp)) {
    if (!CSP_BUCKETS.includes(key)) {
      checks.push({
        label: `${scope}: csp`,
        status: "fail",
        detail: `unknown directive "${key}" (use ${CSP_BUCKETS.join("/")})`,
      });
      continue;
    }
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
      checks.push({
        label: `${scope}: csp.${key}`,
        status: "fail",
        detail: "must be an array of origin strings",
      });
    }
  }
}

async function loadApp(
  entry: string,
  jiti: ReturnType<typeof jitiFor>,
  checks: Check[],
): Promise<LoadedApp | null> {
  const rel = entry.split("/").slice(-2).join("/");
  try {
    const mod = (await jiti.import(entry)) as { app?: LoadedApp };
    if (!mod.app) {
      throw new Error(`${rel} must \`export { app }\` (the defineApp result) for auditing`);
    }
    checks.push({ label: `app: loaded ${rel}`, status: "pass" });
    return mod.app;
  } catch (err) {
    checks.push({ label: "app: load", status: "fail", detail: (err as Error).message });
    return null;
  }
}

function staticToolChecks(app: LoadedApp, checks: Check[]): void {
  const tools = app.tools ?? [];
  if (tools.length === 0) {
    checks.push({ label: "tools: at least one", status: "fail", detail: "app defines no tools" });
    return;
  }
  for (const t of tools) {
    if (!TOOL_NAME_RE.test(t.name ?? "")) {
      checks.push({
        label: `tool ${t.name}: name`,
        status: "fail",
        detail: "must match [a-zA-Z0-9_-]+",
      });
    }
    if (!t.inputSchema || !t.outputSchema) {
      checks.push({
        label: `tool ${t.name}: schemas`,
        status: "fail",
        detail: "inputSchema and outputSchema are required",
      });
    }
    if (t.ui) {
      if (!UI_URI_RE.test(t.ui.uri ?? "")) {
        checks.push({ label: `tool ${t.name}: ui.uri`, status: "fail", detail: t.ui.uri });
      }
      const hasBody = !!t.ui.html || !!t.ui.htmlAsset || !!t.ui.basePath;
      if (!hasBody) {
        checks.push({
          label: `tool ${t.name}: ui body`,
          status: "fail",
          detail: "component has no html, htmlAsset, or basePath",
        });
      }
      cspShapeCheck(`tool ${t.name}`, t.ui.csp, checks);
    }
    const ok =
      TOOL_NAME_RE.test(t.name ?? "") &&
      !!t.inputSchema &&
      !!t.outputSchema &&
      (!t.ui || UI_URI_RE.test(t.ui.uri ?? ""));
    if (ok) checks.push({ label: `tool ${t.name}: ok`, status: "pass" });
  }
}

interface RuntimeOpts {
  port: number | undefined;
  forceRuntime: boolean;
  checks: Check[];
}

/**
 * Build the components, serve the dev emulator, and drive it in a headless
 * browser: assert each UI tool completes the ui/initialize handshake, reports a
 * non-zero size (the classic 0-height collapse), and only contacts origins it
 * declared in `connectDomains`.
 */
async function runtimeChecks(
  cwd: string,
  jiti: ReturnType<typeof jitiFor>,
  config: McpAppConfig | undefined,
  app: LoadedApp,
  { port, forceRuntime, checks }: RuntimeOpts,
): Promise<void> {
  // Playwright is an optional dependency so static audit never pulls a browser.
  // A non-literal specifier keeps it out of the type graph and the bundle.
  let chromium: PwModule["chromium"];
  try {
    const specifier = "playwright";
    ({ chromium } = (await import(specifier)) as PwModule);
  } catch {
    checks.push({
      label: "runtime: headless browser",
      status: forceRuntime ? "fail" : "skip",
      detail:
        "playwright not installed — `pnpm add -D playwright && npx playwright install chromium`",
    });
    return;
  }

  // Get the components into the app's resourceMap. Vue compiles here; Flutter
  // must be pre-built (its build needs the Flutter toolchain).
  const built = await ensureComponents(cwd, jiti, config, app, checks);
  if (!built) return;

  const { serveEmulator } = (await jiti.import("@mcpapps/dev")) as {
    serveEmulator: (
      a: unknown,
      o: { port?: number },
    ) => Promise<{ url: string; close: () => Promise<void> }>;
  };
  const emulator = await serveEmulator(app, port ? { port } : {});

  const browser = await chromium.launch();
  try {
    for (const tool of app.tools ?? []) {
      if (!tool.ui) continue;
      await auditToolInBrowser(browser, emulator.url, tool, checks);
    }
  } finally {
    await browser.close();
    await emulator.close();
  }
}

/** Compile (vue) or verify pre-built (flutter) components into app.resourceMap. */
async function ensureComponents(
  cwd: string,
  jiti: ReturnType<typeof jitiFor>,
  config: McpAppConfig | undefined,
  app: LoadedApp,
  checks: Check[],
): Promise<boolean> {
  if (config?.renderer === "vue") {
    try {
      const { writeComponentsModule } = (await jiti.import("@mcpapps/vite-plugin-vue")) as {
        writeComponentsModule: (
          s: unknown[],
          out: string,
          o: { root: string },
        ) => Promise<CompiledComponentLike[]>;
      };
      const specs = specsFor(cwd, config);
      const out = await writeComponentsModule(specs, generatedPath(cwd, config), { root: cwd });
      specs.forEach((s, i) => {
        if (out[i]) app.resourceMap.set(s.uri, out[i] as CompiledComponentLike);
      });
      checks.push({ label: "runtime: components compiled", status: "pass" });
      return true;
    } catch (err) {
      checks.push({ label: "runtime: compile", status: "fail", detail: (err as Error).message });
      return false;
    }
  }

  // Flutter: serve whatever the app already bound (from a prior build).
  const hasBuilt = [...app.resourceMap.values()].some((c) => c.basePath && c.assets);
  if (!hasBuilt) {
    checks.push({
      label: "runtime: flutter (skipped)",
      status: "skip",
      detail: "build the Flutter app first (pnpm build/deploy), then re-run audit",
    });
    return false;
  }
  return true;
}

/**
 * Drive one tool through the emulator: select it, invoke it, and assert the
 * lifecycle completed and the iframe sized itself, watching for undeclared
 * cross-origin requests.
 */
async function auditToolInBrowser(
  browser: PwBrowser,
  url: string,
  tool: ToolLike,
  checks: Check[],
): Promise<void> {
  const declared = new Set([
    ...(tool.ui?.csp?.connectDomains ?? []),
    ...(tool.ui?.csp?.resourceDomains ?? []),
  ]);
  const undeclared = new Set<string>();
  const page = await browser.newPage();
  if (process.env.AUDIT_DEBUG) {
    page.on("console", (m: { text(): string }) => console.error("[console]", m.text()));
  }
  page.on("request", (req) => {
    try {
      if (process.env.AUDIT_DEBUG) console.error("[req]", req.url());
      const origin = new URL(req.url()).origin;
      if (!req.url().startsWith(url) && !originAllowed(origin, declared)) undeclared.add(origin);
    } catch {
      /* ignore unparsable urls */
    }
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    // The host page populates #tool from tools/list once it loads.
    await page.waitForFunction(() => document.querySelectorAll("#tool option").length > 0, null, {
      timeout: 5000,
    });
    await page.selectOption("#tool", tool.name).catch(() => {});
    await page.click("#invoke");

    // Lifecycle: the host sets the iframe height on ui/notifications/size-changed.
    await page.waitForFunction(
      () => {
        const f = document.getElementById("view") as HTMLIFrameElement | null;
        return !!f && f.getBoundingClientRect().height > 0;
      },
      null,
      { timeout: 10000 },
    );
    checks.push({ label: `runtime ${tool.name}: lifecycle + non-zero size`, status: "pass" });
    // Let any in-flight component requests register before we judge CSP drift.
    await page.waitForTimeout(500);
  } catch {
    checks.push({
      label: `runtime ${tool.name}: lifecycle`,
      status: "fail",
      detail: "iframe never reported a non-zero size — missing ui/notifications/size-changed?",
    });
  } finally {
    if (undeclared.size) {
      checks.push({
        label: `runtime ${tool.name}: csp drift`,
        status: "fail",
        detail: `contacted undeclared origins: ${[...undeclared].join(", ")}`,
      });
    }
    await page.close();
  }
}

/** An origin is allowed if it (or a wildcard parent) is in the declared set. */
export function originAllowed(origin: string, declared: Set<string>): boolean {
  if (declared.has(origin)) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  for (const d of declared) {
    if (d.includes("*")) {
      const suffix = d.slice(d.indexOf("*") + 1).replace(/^\./, "");
      if (host === suffix || host.endsWith(`.${suffix}`)) return true;
    }
  }
  return false;
}

function report(checks: Check[]): void {
  for (const c of checks) {
    const line = `  ${ICON[c.status]} ${c.label}${c.detail ? ` — ${c.detail}` : ""}`;
    if (c.status === "fail") console.error(line);
    else console.log(line);
  }
  const failed = checks.filter((c) => c.status === "fail").length;
  const passed = checks.filter((c) => c.status === "pass").length;
  console.log(`\n  ${passed} passed, ${failed} failed, ${checks.length} checks total`);
  if (failed > 0) process.exitCode = 1;
}
