import {
  AppMethods,
  AppNotifications,
  type CallToolParams,
  DEFAULT_THEME,
  type DisplayMode,
  HostMethods,
  isJsonRpcNotification,
  isJsonRpcResponse,
  type JsonRpcId,
  type JsonRpcMessage,
  type JsonRpcRequest,
  type RequestDisplayModeParams,
  type SendFollowupPromptParams,
  type ThemeState,
  type ToolResultEnvelope,
} from "@mcpapps/protocol";
import { createPostMessageTransport, type Transport, type Unsubscribe } from "./transport.js";

/**
 * The normalized host link both renderers (Vue, Flutter) sit on. It is the only
 * code in the framework that speaks JSON-RPC to the host, so the renderers never
 * diverge: they all consume tool results, theme, and tool calls through this.
 */
export interface HostBridge {
  /** Subscribe to tool results. Replays the latest result immediately if present. */
  onToolResult<TOutput = unknown>(cb: (env: ToolResultEnvelope<TOutput>) => void): Unsubscribe;
  /** Subscribe to theme changes. Replays the current theme immediately. */
  onTheme(cb: (theme: ThemeState) => void): Unsubscribe;
  /** The most recent tool result, or null if none has arrived yet. */
  getLatestToolResult<TOutput = unknown>(): ToolResultEnvelope<TOutput> | null;
  /** The current theme (defaults to light until the host says otherwise). */
  getTheme(): ThemeState;

  /** Invoke a tool on the server and await its (normalized) result. */
  callTool<TArgs = unknown, TOutput = unknown>(
    name: string,
    args: TArgs,
  ): Promise<ToolResultEnvelope<TOutput>>;
  /** Ask the host to change the display mode. */
  requestDisplayMode(mode: DisplayMode): Promise<void>;
  /** Inject a follow-up prompt into the host conversation. */
  sendFollowupPrompt(prompt: string): Promise<void>;

  /** Signal the host the app has mounted (flushes the host's queued result). */
  ready(): void;
  /** Tear down: detach the transport and drop all subscribers. */
  dispose(): void;
}

export interface CreateHostBridgeOptions {
  /** Defaults to a postMessage transport to `window.parent`. */
  transport?: Transport;
}

export function createHostBridge(options: CreateHostBridgeOptions = {}): HostBridge {
  const transport = options.transport ?? createPostMessageTransport();

  let latestToolResult: ToolResultEnvelope | null = null;
  let theme: ThemeState = DEFAULT_THEME;

  const toolResultSubs = new Set<(env: ToolResultEnvelope) => void>();
  const themeSubs = new Set<(theme: ThemeState) => void>();
  const pending = new Map<
    JsonRpcId,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();

  let nextId = 1;

  const detach = transport.onMessage((message) => handleMessage(message));

  function handleMessage(message: JsonRpcMessage): void {
    if (isJsonRpcResponse(message)) {
      const entry = pending.get(message.id ?? -1);
      if (!entry) return;
      pending.delete(message.id ?? -1);
      if ("error" in message) {
        entry.reject(new Error(message.error.message));
      } else {
        entry.resolve(message.result);
      }
      return;
    }
    if (isJsonRpcNotification(message)) {
      switch (message.method) {
        case AppNotifications.ToolResult: {
          publishToolResult(normalizeToolResult(message.params));
          break;
        }
        case AppNotifications.Theme: {
          theme = (message.params as ThemeState) ?? DEFAULT_THEME;
          for (const cb of themeSubs) cb(theme);
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

  function request<TResult>(method: string, params: unknown): Promise<TResult> {
    const id = nextId++;
    const message: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    return new Promise<TResult>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
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
    onTheme(cb) {
      themeSubs.add(cb);
      cb(theme);
      return () => themeSubs.delete(cb);
    },
    getLatestToolResult<TOutput>() {
      return latestToolResult as ToolResultEnvelope<TOutput> | null;
    },
    getTheme() {
      return theme;
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
    async sendFollowupPrompt(prompt) {
      const params: SendFollowupPromptParams = { prompt };
      await request<unknown>(HostMethods.SendFollowupPrompt, params);
    },
    ready() {
      transport.send({ jsonrpc: "2.0", method: AppMethods.Ready });
    },
    dispose() {
      detach();
      transport.close();
      pending.clear();
      toolResultSubs.clear();
      themeSubs.clear();
    },
  };
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
