import {
  type CompiledComponent,
  type JsonRpcError,
  JsonRpcErrorCode,
  type JsonRpcMessage,
  type JsonRpcRequest,
  type JsonRpcSuccess,
  MCP_APP_MIME,
  type McpUiResourceCsp,
} from "@mcpapps/protocol";
import type { AnyToolDefinition, McpApp } from "./define.js";

/** MCP protocol version this server speaks (echoes the client's if compatible). */
export const SUPPORTED_PROTOCOL_VERSION = "2025-06-18";

export interface McpHandlerOptions {
  /** Add permissive CORS headers (useful for the browser emulator). Default true. */
  cors?: boolean;
}

export type FetchHandler = (request: Request) => Promise<Response>;

/**
 * Build a Workers-native `fetch` handler that implements MCP over Streamable
 * HTTP for the given app. Stateless: each POST carries one JSON-RPC request (or
 * a batch) and gets a single JSON response. No Node `req`/`res` — runs anywhere
 * the Web Fetch API exists (Workers, Bun, Deno, Node via @hono/node-server).
 */
export function createMcpHandler(app: McpApp, options: McpHandlerOptions = {}): FetchHandler {
  const cors = options.cors ?? true;
  const corsHeaders: Record<string, string> = cors
    ? {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
      }
    : {};

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
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
    for (const message of messages) {
      const response = await processMessage(app, message as JsonRpcMessage);
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
): Promise<JsonRpcMessage | null> {
  // Notifications (no id) get no response.
  if (!("id" in message) || message.id === undefined) {
    return null;
  }
  const req = message as JsonRpcRequest;
  try {
    const result = await dispatch(app, req);
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

async function dispatch(app: McpApp, req: JsonRpcRequest): Promise<unknown> {
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
      return readResource(app, req.params);
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

/** ChatGPT legacy `openai/widgetCSP` (snake_case), or undefined if nothing set. */
function openaiWidgetCsp(csp?: McpUiResourceCsp): Record<string, string[]> | undefined {
  if (!csp) return undefined;
  const out: Record<string, string[]> = {};
  if (csp.connectDomains) out.connect_domains = csp.connectDomains;
  if (csp.resourceDomains) out.resource_domains = csp.resourceDomains;
  return Object.keys(out).length ? out : undefined;
}

function describeTool(app: McpApp, tool: AnyToolDefinition) {
  const meta: Record<string, unknown> = {};
  if (tool.ui) {
    meta.ui = uiMetaFor(tool.ui);
    if (app.compat) {
      // Mirror vendor-specific keys so the same server works across hosts.
      meta["openai/outputTemplate"] = tool.ui.uri;
      meta["mcpui.dev/ui-resource-uri"] = tool.ui.uri;
      const widgetCsp = openaiWidgetCsp(tool.ui.csp);
      if (widgetCsp) meta["openai/widgetCSP"] = widgetCsp;
    }
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

function readResource(app: McpApp, params: unknown): unknown {
  const { uri } = (params ?? {}) as { uri?: string };
  if (!uri) throw new RpcError(JsonRpcErrorCode.InvalidParams, "Missing resource uri");
  const component = app.resourceMap.get(uri);
  if (!component) {
    throw new RpcError(JsonRpcErrorCode.InvalidParams, `Unknown resource: ${uri}`);
  }
  const meta: Record<string, unknown> = { ui: uiMetaFor(component) };
  if (app.compat) {
    const widgetCsp = openaiWidgetCsp(component.csp);
    if (widgetCsp) meta["openai/widgetCSP"] = widgetCsp;
  }
  return {
    contents: [{ uri: component.uri, mimeType: MCP_APP_MIME, text: component.html, _meta: meta }],
  };
}

function negotiateVersion(params: unknown): string {
  const requested = (params as { protocolVersion?: string } | undefined)?.protocolVersion;
  return requested ?? SUPPORTED_PROTOCOL_VERSION;
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
