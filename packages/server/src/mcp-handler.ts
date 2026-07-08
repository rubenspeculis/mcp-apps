import {
  type CompiledComponent,
  HOST_PROFILES,
  type HostId,
  type HostProfile,
  type JsonRpcError,
  JsonRpcErrorCode,
  type JsonRpcMessage,
  type JsonRpcRequest,
  type JsonRpcSuccess,
  MCP_APP_MIME,
  type McpUiResourceCsp,
} from "@mcpapps/protocol";
import type { AnyToolDefinition, AppDefinition, McpApp } from "./define.js";

/**
 * Base MCP transport version this server speaks — a different axis from
 * `@mcpapps/protocol`'s `PROTOCOL_VERSION` (the MCP Apps UI-extension version
 * used in the `ui/initialize` iframe handshake). Requests must match exactly;
 * unsupported versions are rejected rather than echoed back.
 */
export const SUPPORTED_PROTOCOL_VERSION = "2025-06-18";

export interface McpHandlerOptions {
  /** Add CORS headers. `true` = permissive `*` (default). `{ origin }` = allowlist. */
  cors?: boolean | { origin: string | string[] };
  /**
   * Gate every non-preflight request. Return `false` (or throw) to reject with
   * a `401`. Runs after OPTIONS preflight (which must always succeed) and
   * before any body parsing or dispatch.
   */
  authorize?: (request: Request) => boolean | Promise<boolean>;
  /**
   * Resolve a component's HTML at `resources/read` time. Lets a host serve a
   * large self-contained document from a static asset (via `component.htmlAsset`)
   * instead of bundling it into the Worker script. Defaults to `component.html`.
   */
  resolveHtml?: (component: CompiledComponent, request: Request) => string | Promise<string>;
}

export type FetchHandler = (request: Request) => Promise<Response>;

/**
 * Build a Workers-native `fetch` handler that implements MCP over Streamable
 * HTTP for the given app. Stateless: each POST carries one JSON-RPC request (or
 * a batch) and gets a single JSON response. No Node `req`/`res` — runs anywhere
 * the Web Fetch API exists (Workers, Bun, Deno, Node via @hono/node-server).
 */
export function createMcpHandler(app: McpApp, options: McpHandlerOptions = {}): FetchHandler {
  const corsConfig = options.cors ?? true;

  // Origin allowlisting depends on the incoming request's `Origin` header, so
  // headers are computed per-request rather than once at handler-creation time.
  function buildCorsHeaders(request: Request): Record<string, string> {
    if (corsConfig === false) return {};
    const base = {
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
    };
    if (corsConfig === true) {
      return { ...base, "Access-Control-Allow-Origin": "*" };
    }
    const allowed = Array.isArray(corsConfig.origin) ? corsConfig.origin : [corsConfig.origin];
    const requestOrigin = request.headers.get("Origin");
    if (requestOrigin && allowed.includes(requestOrigin)) {
      return { ...base, "Access-Control-Allow-Origin": requestOrigin, Vary: "Origin" };
    }
    // No matching allowlisted origin -> omit Access-Control-Allow-Origin so
    // the browser blocks the response, without leaking which origins ARE allowed.
    return base;
  }

  return async (request: Request): Promise<Response> => {
    const corsHeaders = buildCorsHeaders(request);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (options.authorize) {
      let authorized: boolean;
      try {
        authorized = await options.authorize(request);
      } catch {
        authorized = false;
      }
      if (!authorized) {
        return json({ error: "Unauthorized" }, 401);
      }
    }

    // GET would open a server->client SSE stream; we have no server-initiated
    // messages yet, so decline it (clients fall back to request/response).
    if (request.method === "GET") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json(makeError(null, JsonRpcErrorCode.ParseError, "Invalid JSON"), 400);
    }

    const messages = Array.isArray(payload) ? payload : [payload];
    const responses: JsonRpcMessage[] = [];
    const ctx: DispatchCtx = { request, resolveHtml: options.resolveHtml };
    for (const message of messages) {
      const response = await processMessage(app, message as JsonRpcMessage, ctx);
      if (response) responses.push(response);
    }

    // Notifications/responses only -> 202 Accepted, no body (Streamable HTTP).
    if (responses.length === 0) {
      return new Response(null, { status: 202, headers: corsHeaders });
    }
    return json(Array.isArray(payload) ? responses : responses[0]);
  };
}

/**
 * Process one JSON-RPC message against the app and return the response (or null
 * for notifications). Transport-agnostic — shared by the HTTP handler and stdio.
 */
export async function processMessage(
  app: McpApp,
  message: JsonRpcMessage,
  ctx?: DispatchCtx,
): Promise<JsonRpcMessage | null> {
  // Notifications (no id) get no response.
  if (!("id" in message) || message.id === undefined) {
    return null;
  }
  const req = message as JsonRpcRequest;
  try {
    const result = await dispatch(app, req, ctx);
    return { jsonrpc: "2.0", id: req.id, result } satisfies JsonRpcSuccess;
  } catch (err) {
    if (err instanceof RpcError) {
      return makeError(req.id, err.code, err.message, err.data);
    }
    return makeError(
      req.id,
      JsonRpcErrorCode.InternalError,
      err instanceof Error ? err.message : "Internal error",
    );
  }
}

/** Per-request context threaded to handlers that need the raw request or html resolver. */
interface DispatchCtx {
  request: Request;
  resolveHtml:
    | ((component: CompiledComponent, request: Request) => string | Promise<string>)
    | undefined;
}

async function dispatch(app: McpApp, req: JsonRpcRequest, ctx?: DispatchCtx): Promise<unknown> {
  switch (req.method) {
    case "initialize":
      return {
        protocolVersion: negotiateVersion(req.params),
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: app.name, version: app.version },
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: app.tools.map((t) => describeTool(app, t)) };
    case "tools/call":
      return callTool(app, req.params);
    case "resources/list":
      return {
        resources: [...app.resourceMap.values()].map((c) => ({
          uri: c.uri,
          name: c.uri,
          mimeType: MCP_APP_MIME,
          _meta: { ui: uiMetaFor(c) },
        })),
      };
    case "resources/read":
      return readResource(app, req.params, ctx);
    default:
      throw new RpcError(JsonRpcErrorCode.MethodNotFound, `Method not found: ${req.method}`);
  }
}

/** Build the spec `_meta.ui` block (resourceUri + any CSP/permissions hints). */
function uiMetaFor(c: CompiledComponent): Record<string, unknown> {
  const ui: Record<string, unknown> = { resourceUri: c.uri };
  if (c.csp) ui.csp = c.csp;
  if (c.permissions) ui.permissions = c.permissions;
  if (c.domain) ui.domain = c.domain;
  if (c.prefersBorder !== undefined) ui.prefersBorder = c.prefersBorder;
  return ui;
}

/** Resolve an app's `compat` setting to the host profiles to mirror `_meta` for. */
function compatProfiles(compat: AppDefinition["compat"]): HostProfile[] {
  if (!compat) return [];
  const hostIds: HostId[] = compat === true ? ["chatgpt"] : compat;
  return hostIds.map((id) => HOST_PROFILES[id]).filter((p): p is HostProfile => !!p);
}

/** A host's vendor CSP mirror (e.g. ChatGPT's snake_case `widgetCSP`), driven by its `cspKeyMap`. */
function widgetCspFor(
  profile: HostProfile,
  csp?: McpUiResourceCsp,
): Record<string, string[]> | undefined {
  if (!csp) return undefined;
  const out: Record<string, string[]> = {};
  for (const [bucket, vendorKey] of Object.entries(profile.cspKeyMap) as [
    keyof McpUiResourceCsp,
    string,
  ][]) {
    const value = csp[bucket];
    if (value) out[vendorKey] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Mirror the spec `_meta.ui` block into each target host's vendor `_meta` keys. */
function mirrorCompatMeta(
  meta: Record<string, unknown>,
  compat: AppDefinition["compat"],
  uri: string,
  csp: McpUiResourceCsp | undefined,
): void {
  for (const profile of compatProfiles(compat)) {
    if (!profile.metaKeys) continue;
    if (profile.metaKeys.outputTemplate) meta[profile.metaKeys.outputTemplate] = uri;
    if (profile.metaKeys.uiResourceUri) meta[profile.metaKeys.uiResourceUri] = uri;
    if (profile.metaKeys.widgetCsp) {
      const widgetCsp = widgetCspFor(profile, csp);
      if (widgetCsp) meta[profile.metaKeys.widgetCsp] = widgetCsp;
    }
  }
}

function describeTool(app: McpApp, tool: AnyToolDefinition) {
  const meta: Record<string, unknown> = {};
  if (tool.ui) {
    meta.ui = uiMetaFor(tool.ui);
    mirrorCompatMeta(meta, app.compat, tool.ui.uri, tool.ui.csp);
  }
  return {
    name: tool.name,
    description: tool.description ?? "",
    inputSchema: toJsonSchema(tool.inputSchema),
    outputSchema: toJsonSchema(tool.outputSchema),
    ...(tool.ui ? { _meta: meta } : {}),
  };
}

async function callTool(app: McpApp, params: unknown): Promise<unknown> {
  const { name, arguments: args } = (params ?? {}) as { name?: string; arguments?: unknown };
  if (!name) throw new RpcError(JsonRpcErrorCode.InvalidParams, "Missing tool name");
  const tool = app.toolMap.get(name);
  if (!tool) throw new RpcError(JsonRpcErrorCode.InvalidParams, `Unknown tool: ${name}`);

  const parsedArgs = tool.inputSchema.safeParse(args ?? {});
  if (!parsedArgs.success) {
    return toolError(`Invalid arguments: ${parsedArgs.error.message}`);
  }

  let output: unknown;
  try {
    output = await tool.handler(parsedArgs.data);
  } catch (err) {
    return toolError(err instanceof Error ? err.message : "Tool execution failed");
  }

  const parsedOutput = tool.outputSchema.safeParse(output);
  if (!parsedOutput.success) {
    return toolError(`Tool returned invalid output: ${parsedOutput.error.message}`);
  }

  const meta = tool.ui ? { ui: { resourceUri: tool.ui.uri } } : undefined;
  return {
    content: [{ type: "text", text: JSON.stringify(parsedOutput.data) }],
    structuredContent: parsedOutput.data,
    ...(meta ? { _meta: meta } : {}),
  };
}

async function readResource(app: McpApp, params: unknown, ctx?: DispatchCtx): Promise<unknown> {
  const { uri } = (params ?? {}) as { uri?: string };
  if (!uri) throw new RpcError(JsonRpcErrorCode.InvalidParams, "Missing resource uri");
  const component = app.resourceMap.get(uri);
  if (!component) {
    throw new RpcError(JsonRpcErrorCode.InvalidParams, `Unknown resource: ${uri}`);
  }
  const meta: Record<string, unknown> = { ui: uiMetaFor(component) };
  mirrorCompatMeta(meta, app.compat, component.uri, component.csp);
  // Resolve the HTML lazily (e.g. from a static asset) when a resolver is given
  // and the component points at one; otherwise use the bundled `html`.
  const text =
    ctx?.resolveHtml && (component.htmlAsset || component.html === "")
      ? await ctx.resolveHtml(component, ctx.request)
      : component.html;
  return {
    contents: [{ uri: component.uri, mimeType: MCP_APP_MIME, text, _meta: meta }],
  };
}

function negotiateVersion(params: unknown): string {
  const requested = (params as { protocolVersion?: string } | undefined)?.protocolVersion;
  if (requested === undefined) return SUPPORTED_PROTOCOL_VERSION;
  if (requested !== SUPPORTED_PROTOCOL_VERSION) {
    throw new RpcError(
      JsonRpcErrorCode.InvalidParams,
      `Unsupported protocolVersion "${requested}" (server supports "${SUPPORTED_PROTOCOL_VERSION}")`,
    );
  }
  return requested;
}

function toJsonSchema(schema: { toJSONSchema(): unknown }) {
  const result = schema.toJSONSchema() as Record<string, unknown>;
  delete result.$schema;
  return result;
}

function toolError(message: string) {
  return { content: [{ type: "text", text: message }], isError: true };
}

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

function makeError(
  id: JsonRpcRequest["id"] | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}
