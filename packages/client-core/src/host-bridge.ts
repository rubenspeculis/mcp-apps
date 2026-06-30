import {
  AppNotifications,
  type CallToolParams,
  DEFAULT_THEME,
  type DisplayMode,
  type HostContext,
  HostMethods,
  HostNotifications,
  type InitializeParams,
  type InitializeResult,
  isJsonRpcNotification,
  isJsonRpcResponse,
  type JsonRpcId,
  type JsonRpcMessage,
  type JsonRpcRequest,
  PROTOCOL_VERSION,
  type RequestDisplayModeParams,
  type SizeChangedParams,
  type ThemeState,
  type ToolInputParams,
  type ToolResultEnvelope,
  type UiMessageParams,
} from "@mcpapps/protocol";
import { createPostMessageTransport, type Transport, type Unsubscribe } from "./transport.js";

/** Identifies the app to the host in the `ui/initialize` handshake. */
const CLIENT_INFO = { name: "@mcpapps/client-core", version: "0.0.0" } as const;

/** How long to wait for the host's `ui/initialize` response before proceeding. */
const DEFAULT_INITIALIZE_TIMEOUT_MS = 2000;

/**
 * The normalized host link both renderers (Vue, Flutter) sit on. It is the only
 * code in the framework that speaks the MCP Apps JSON-RPC lifecycle to the host,
 * so the renderers never diverge: they all consume tool results, theme, and tool
 * calls through this.
 */
export interface HostBridge {
  /** Subscribe to tool results. Replays the latest result immediately if present. */
  onToolResult<TOutput = unknown>(cb: (env: ToolResultEnvelope<TOutput>) => void): Unsubscribe;
  /** Subscribe to theme changes. Replays the current theme immediately. */
  onTheme(cb: (theme: ThemeState) => void): Unsubscribe;
  /** Subscribe to host-context changes (theme, container size, display mode, …). */
  onHostContext(cb: (ctx: HostContext) => void): Unsubscribe;
  /** Subscribe to the (complete) tool input. Replays the latest if present. */
  onToolInput(cb: (args: Record<string, unknown>) => void): Unsubscribe;
  /** The most recent tool result, or null if none has arrived yet. */
  getLatestToolResult<TOutput = unknown>(): ToolResultEnvelope<TOutput> | null;
  /** The current theme (defaults to light until the host says otherwise). */
  getTheme(): ThemeState;
  /** The latest host context received from the host, if any. */
  getHostContext(): HostContext | null;

  /** Invoke a tool on the server and await its (normalized) result. */
  callTool<TArgs = unknown, TOutput = unknown>(
    name: string,
    args: TArgs,
  ): Promise<ToolResultEnvelope<TOutput>>;
  /** Ask the host to change the display mode. */
  requestDisplayMode(mode: DisplayMode): Promise<void>;
  /** Send a user message (e.g. a follow-up prompt) into the host conversation. */
  sendMessage(text: string): Promise<void>;
  /** Report the rendered content size so the host can size a flexible iframe. */
  reportSize(width: number, height: number): void;

  /**
   * Run the `ui/initialize` handshake: send the request, seed theme/context from
   * the response, then send `ui/notifications/initialized` (which unblocks the
   * host's tool-input/tool-result notifications). Resolves with the host's
   * response (or a minimal default if the host does not answer in time).
   */
  initialize(): Promise<InitializeResult>;
  /** Tear down: detach the transport and drop all subscribers. */
  dispose(): void;
}

export interface CreateHostBridgeOptions {
  /** Defaults to a postMessage transport to `window.parent`. */
  transport?: Transport;
  /** Display modes the app supports; advertised in `ui/initialize`. */
  availableDisplayModes?: DisplayMode[];
  /** Override the `ui/initialize` response timeout. Defaults to 2000ms. */
  initializeTimeoutMs?: number;
  /** Called when initialize times out or fails and the bridge falls back. */
  onInitializeFallback?: (error: Error) => void;
}

export function createHostBridge(options: CreateHostBridgeOptions = {}): HostBridge {
  const transport = options.transport ?? createPostMessageTransport();

  let latestToolResult: ToolResultEnvelope | null = null;
  let latestToolInput: Record<string, unknown> | null = null;
  let hostContext: HostContext | null = null;
  let theme: ThemeState = DEFAULT_THEME;

  const toolResultSubs = new Set<(env: ToolResultEnvelope) => void>();
  const toolInputSubs = new Set<(args: Record<string, unknown>) => void>();
  const themeSubs = new Set<(theme: ThemeState) => void>();
  const hostContextSubs = new Set<(ctx: HostContext) => void>();
  const pending = new Map<
    JsonRpcId,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      timer?: ReturnType<typeof setTimeout>;
    }
  >();

  let nextId = 1;

  const detach = transport.onMessage((message) => handleMessage(message));

  function handleMessage(message: JsonRpcMessage): void {
    if (isJsonRpcResponse(message)) {
      const entry = pending.get(message.id ?? -1);
      if (!entry) return;
      pending.delete(message.id ?? -1);
      if (entry.timer) clearTimeout(entry.timer);
      if ("error" in message) {
        entry.reject(new Error(message.error.message));
      } else {
        entry.resolve(message.result);
      }
      return;
    }
    if (isJsonRpcNotification(message)) {
      switch (message.method) {
        case HostNotifications.ToolResult: {
          publishToolResult(normalizeToolResult(message.params));
          break;
        }
        case HostNotifications.ToolInput:
        case HostNotifications.ToolInputPartial: {
          const params = (message.params ?? {}) as ToolInputParams;
          publishToolInput(params.arguments ?? {});
          break;
        }
        case HostNotifications.HostContextChanged: {
          applyHostContext((message.params ?? {}) as HostContext);
          break;
        }
        default:
          break;
      }
    }
  }

  function publishToolResult(env: ToolResultEnvelope): void {
    latestToolResult = env;
    for (const cb of toolResultSubs) cb(env);
  }

  function publishToolInput(args: Record<string, unknown>): void {
    latestToolInput = args;
    for (const cb of toolInputSubs) cb(args);
  }

  /** Merge a (partial) host context, re-derive theme, and notify subscribers. */
  function applyHostContext(ctx: HostContext): void {
    hostContext = { ...(hostContext ?? {}), ...ctx };
    if ("theme" in ctx || ctx.styles) {
      theme = themeFromContext(hostContext);
      for (const cb of themeSubs) cb(theme);
    }
    for (const cb of hostContextSubs) cb(hostContext);
  }

  function request<TResult>(method: string, params: unknown, timeoutMs?: number): Promise<TResult> {
    const id = nextId++;
    const message: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    return new Promise<TResult>((resolve, reject) => {
      const entry: {
        resolve: (value: unknown) => void;
        reject: (reason: Error) => void;
        timer?: ReturnType<typeof setTimeout>;
      } = { resolve: resolve as (v: unknown) => void, reject };
      if (timeoutMs !== undefined) {
        entry.timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }
      pending.set(id, entry);
      transport.send(message);
    });
  }

  return {
    onToolResult<TOutput>(cb: (env: ToolResultEnvelope<TOutput>) => void) {
      const typed = cb as (env: ToolResultEnvelope) => void;
      toolResultSubs.add(typed);
      if (latestToolResult) cb(latestToolResult as ToolResultEnvelope<TOutput>);
      return () => toolResultSubs.delete(typed);
    },
    onToolInput(cb) {
      toolInputSubs.add(cb);
      if (latestToolInput) cb(latestToolInput);
      return () => toolInputSubs.delete(cb);
    },
    onTheme(cb) {
      themeSubs.add(cb);
      cb(theme);
      return () => themeSubs.delete(cb);
    },
    onHostContext(cb) {
      hostContextSubs.add(cb);
      if (hostContext) cb(hostContext);
      return () => hostContextSubs.delete(cb);
    },
    getLatestToolResult<TOutput>() {
      return latestToolResult as ToolResultEnvelope<TOutput> | null;
    },
    getTheme() {
      return theme;
    },
    getHostContext() {
      return hostContext;
    },
    async callTool<TArgs, TOutput>(name: string, args: TArgs) {
      const params: CallToolParams<TArgs> = { name, arguments: args };
      const result = await request<unknown>(HostMethods.CallTool, params);
      const env = normalizeToolResult(result, name) as ToolResultEnvelope<TOutput>;
      // A tool call also refreshes the reactive "latest result" so a component
      // using onToolResult updates without separately threading the return value.
      publishToolResult(env);
      return env;
    },
    async requestDisplayMode(mode) {
      const params: RequestDisplayModeParams = { mode };
      await request<unknown>(HostMethods.RequestDisplayMode, params);
    },
    async sendMessage(text) {
      const params: UiMessageParams = { role: "user", content: { type: "text", text } };
      await request<unknown>(HostMethods.Message, params);
    },
    reportSize(width, height) {
      const params: SizeChangedParams = { width: Math.round(width), height: Math.round(height) };
      transport.send({ jsonrpc: "2.0", method: AppNotifications.SizeChanged, params });
    },
    async initialize() {
      const params: InitializeParams = {
        appCapabilities: options.availableDisplayModes
          ? { availableDisplayModes: options.availableDisplayModes }
          : {},
        clientInfo: CLIENT_INFO,
        protocolVersion: PROTOCOL_VERSION,
      };
      let result: InitializeResult;
      try {
        result = await request<InitializeResult>(
          HostMethods.Initialize,
          params,
          options.initializeTimeoutMs ?? DEFAULT_INITIALIZE_TIMEOUT_MS,
        );
      } catch (err) {
        // A host that doesn't implement ui/initialize (or is slow) still gets an
        // `initialized` notification below so it can start pushing data.
        const error = err instanceof Error ? err : new Error("ui/initialize failed");
        reportInitializeFallback(error);
        result = { protocolVersion: PROTOCOL_VERSION };
      }
      if (result.hostContext) applyHostContext(result.hostContext);
      transport.send({ jsonrpc: "2.0", method: AppNotifications.Initialized, params: {} });
      return result;
    },
    dispose() {
      detach();
      transport.close();
      for (const entry of pending.values()) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      pending.clear();
      toolResultSubs.clear();
      toolInputSubs.clear();
      themeSubs.clear();
      hostContextSubs.clear();
    },
  };

  function reportInitializeFallback(error: Error): void {
    if (options.onInitializeFallback) {
      options.onInitializeFallback(error);
      return;
    }
    console.warn(`@mcpapps/client-core: ui/initialize fallback: ${error.message}`);
  }
}

/** Derive the normalized theme from a host context's theme + style variables. */
function themeFromContext(ctx: HostContext | null): ThemeState {
  if (!ctx) return DEFAULT_THEME;
  const tokens: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx.styles?.variables ?? {})) {
    if (typeof v === "string") tokens[k] = v;
  }
  return { colorScheme: ctx.theme ?? DEFAULT_THEME.colorScheme, tokens };
}

/**
 * Coerce whatever the host sends into a ToolResultEnvelope. Accepts both our own
 * envelope shape and a raw MCP CallToolResult (which lacks `toolName`).
 */
function normalizeToolResult(raw: unknown, fallbackName = "unknown"): ToolResultEnvelope {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const env: ToolResultEnvelope = {
    toolName: typeof obj.toolName === "string" ? obj.toolName : fallbackName,
    structuredContent: "structuredContent" in obj ? obj.structuredContent : (obj.content ?? null),
    isError: obj.isError === true,
  };
  if (Array.isArray(obj.content)) env.content = obj.content;
  return env;
}
