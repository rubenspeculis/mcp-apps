/// <reference lib="dom" />
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { HOST_PROFILES, type HostId } from "@mcpapps/protocol";
import { parseArgs } from "./args.js";
import type { McpAppConfig, McpUiResourceCsp } from "./config.js";
import { createOriginPolicy } from "./origin-policy.js";
import { jitiFor, type ProjectApp, type ProjectTool, prepareProject } from "./project.js";

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

export type CheckStatus = "pass" | "fail" | "warn" | "skip";
export interface Check {
  label: string;
  status: CheckStatus;
  detail?: string;
}

const ICON: Record<CheckStatus, string> = { pass: "✓", fail: "✗", warn: "!", skip: "·" };
const CSP_BUCKETS = [
  "connectDomains",
  "resourceDomains",
  "frameDomains",
  "baseUriDomains",
] as const;
const TOOL_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const UI_URI_RE = /^ui:\/\/.+/;
const HOST_IDS: HostId[] = ["claude", "chatgpt"];

/**
 * CSP buckets a given host actually enforces from `_meta.ui.csp`. Claude
 * consumes all four; a vendor host only honors the buckets its `cspKeyMap`
 * mirrors (today: ChatGPT drops `frameDomains`/`baseUriDomains`).
 */
function cspBucketsForHost(host: HostId): (typeof CSP_BUCKETS)[number][] {
  if (host === "claude") return [...CSP_BUCKETS];
  return Object.keys(HOST_PROFILES[host].cspKeyMap) as (typeof CSP_BUCKETS)[number][];
}

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

  const hostFlag = typeof flags.host === "string" ? flags.host : "all";
  if (hostFlag !== "all" && !HOST_IDS.includes(hostFlag as HostId)) {
    console.error(`Unknown --host "${hostFlag}" (expected ${HOST_IDS.join("|")}|all)`);
    process.exitCode = 1;
    return;
  }
  const targetHosts: HostId[] = hostFlag === "all" ? HOST_IDS : [hostFlag as HostId];

  const cwd = process.cwd();
  const checks: Check[] = [];
  let app: ProjectApp | undefined;
  try {
    // Static means browser-free, not build-free. Prepare once so both audit
    // passes inspect the exact resources the emulator will serve.
    const prepared = await prepareProject(cwd);
    app = prepared.app;
    checks.push({ label: "project: resources prepared", status: "pass" });
    if (prepared.config) staticConfigChecks(prepared.config, cwd, checks);
    staticToolChecks(app, checks, targetHosts);
    if (app.renderer === "flutter") flutterArtifactChecks(cwd, checks);
  } catch (error) {
    checks.push({
      label: "project: preparation",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  if (app && !staticOnly) {
    await runtimeChecks(jitiFor(cwd), app, { port, forceRuntime, targetHosts, checks });
  } else if (staticOnly) {
    checks.push({ label: "runtime: skipped (--static-only)", status: "skip" });
  }

  report(checks);
}

/** Flutter has no central config — verify the build wiring instead. */
export function flutterArtifactChecks(cwd: string, checks: Check[]): void {
  const meta = existsSync(resolve(cwd, "src/generated/component-meta.ts"));
  checks.push({
    label: "flutter: generated/component-meta.ts",
    status: meta ? "pass" : "warn",
    ...(meta ? {} : { detail: "run `pnpm build` to generate it" }),
  });
}

export function staticConfigChecks(config: McpAppConfig, cwd: string, checks: Check[]): void {
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

/**
 * CSP must only use the four supported buckets, each an array of syntactically
 * valid origin strings (an absolute http(s) URL, optionally `*.`-wildcarded).
 */
export function cspShapeCheck(
  scope: string,
  csp: McpUiResourceCsp | undefined,
  checks: Check[],
): void {
  if (!csp) return;
  for (const [key, value] of Object.entries(csp)) {
    if (!CSP_BUCKETS.includes(key as (typeof CSP_BUCKETS)[number])) {
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
      continue;
    }
    const { invalid } = createOriginPolicy(value);
    if (invalid.length) {
      checks.push({
        label: `${scope}: csp.${key}`,
        status: "fail",
        detail: `invalid origin(s): ${invalid.map((v) => `"${v}"`).join(", ")} (expected an absolute http(s) origin, optionally "*."-wildcarded)`,
      });
    }
  }
}

export function staticToolChecks(
  app: ProjectApp,
  checks: Check[],
  targetHosts: HostId[] = HOST_IDS,
): void {
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

      if (targetHosts.includes("claude") && t.ui.basePath && !t.ui.html && !t.ui.htmlAsset) {
        checks.push({
          label: `claude: tool ${t.name}: ui body`,
          status: "fail",
          detail:
            "Claude serves a single self-contained resource with no sibling assets — a basePath-only component (no html/htmlAsset) cannot be delivered",
        });
      }
      if (targetHosts.includes("chatgpt")) {
        const undropped = (["frameDomains", "baseUriDomains"] as const).filter(
          (bucket) => (t.ui?.csp?.[bucket]?.length ?? 0) > 0,
        );
        if (undropped.length) {
          checks.push({
            label: `chatgpt: tool ${t.name}: csp`,
            status: "warn",
            detail: `${undropped.join(", ")} declared but not mirrored to ChatGPT's widget CSP (no known equivalent bucket)`,
          });
        }
      }
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
  targetHosts: HostId[];
  checks: Check[];
}

/**
 * Serve the prepared app in the dev emulator and drive it in a headless
 * browser: assert each UI tool completes the ui/initialize handshake, reports a
 * non-zero size (the classic 0-height collapse), and only contacts origins it
 * declared in `connectDomains`.
 */
async function runtimeChecks(
  jiti: ReturnType<typeof jitiFor>,
  app: ProjectApp,
  { port, forceRuntime, targetHosts, checks }: RuntimeOpts,
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

  // Flutter stays pre-built; htmlAsset-only deployment resolution is outside
  // the emulator's current delivery support.
  if (
    app.renderer === "flutter" &&
    ![...app.resourceMap.values()].some((resource) => resource.basePath && resource.assets)
  ) {
    checks.push({
      label: "runtime: flutter (skipped)",
      status: "skip",
      detail: "build the Flutter app for the emulator first, then re-run audit",
    });
    return;
  }

  const { serveEmulator } = (await jiti.import("@mcpapps/dev")) as {
    serveEmulator: (
      a: unknown,
      o: { port?: number },
    ) => Promise<{ url: string; close: () => Promise<void> }>;
  };
  const emulator = await serveEmulator(app, port ? { port } : {});

  let browser: PwBrowser | undefined;
  try {
    browser = await chromium.launch();
    for (const tool of app.tools ?? []) {
      if (!tool.ui) continue;
      await auditToolInBrowser(browser, emulator.url, tool, targetHosts, checks);
    }
  } catch (error) {
    checks.push({
      label: "runtime: browser",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    try {
      await browser?.close();
    } finally {
      await emulator.close();
    }
  }
}

/**
 * Drive one tool through the emulator: select it, invoke it, and assert the
 * lifecycle completed and the iframe sized itself, watching for undeclared
 * cross-origin requests.
 */
async function auditToolInBrowser(
  browser: PwBrowser,
  url: string,
  tool: ProjectTool,
  targetHosts: HostId[],
  checks: Check[],
): Promise<void> {
  // Union the CSP buckets every targeted host actually enforces — e.g. a
  // ChatGPT-only run doesn't treat frameDomains/baseUriDomains as declared,
  // matching what its client would enforce; a Claude run treats all four as
  // declared, since Claude has no dropped-bucket problem.
  const enforcedBuckets = new Set(targetHosts.flatMap((h) => cspBucketsForHost(h)));
  const policy = createOriginPolicy(
    [...enforcedBuckets].flatMap((bucket) => tool.ui?.csp?.[bucket] ?? []),
  );
  const emulatorOrigin = new URL(url).origin;
  const undeclared = new Set<string>();
  const page = await browser.newPage();
  if (process.env.AUDIT_DEBUG) {
    page.on("console", (m: { text(): string }) => console.error("[console]", m.text()));
  }
  page.on("request", (req) => {
    try {
      if (process.env.AUDIT_DEBUG) console.error("[req]", req.url());
      const origin = new URL(req.url()).origin;
      if (origin !== emulatorOrigin && !policy.allows(origin)) undeclared.add(origin);
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
