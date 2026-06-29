/**
 * Spec constants for the MCP Apps extension (SEP-1865, ext-apps spec
 * `2026-01-26`). Keeping every wire-level string in ONE place means a spec
 * change is a one-line edit, never a hunt across packages.
 */

/** Protocol version the app declares in `ui/initialize`. */
export const PROTOCOL_VERSION = "2026-01-26" as const;

/** MIME type marking an HTML resource as an MCP App component. */
export const MCP_APP_MIME = "text/html;profile=mcp-app" as const;

/** Scheme for UI resource URIs, e.g. `ui://weather-app/get_weather`. */
export const UI_SCHEME = "ui://" as const;

/**
 * JSON-RPC request methods the app (iframe) CALLS on the host (app → host,
 * each expects a response).
 */
export const HostMethods = {
  /** Begin the lifecycle handshake; the response carries the host context. */
  Initialize: "ui/initialize",
  /** Invoke an MCP tool on the server and await its result. */
  CallTool: "tools/call",
  /** Ask the host to change how the component is displayed. */
  RequestDisplayMode: "ui/request-display-mode",
  /** Inject a message (e.g. a follow-up prompt) into the host conversation. */
  Message: "ui/message",
} as const;
export type HostMethod = (typeof HostMethods)[keyof typeof HostMethods];

/**
 * JSON-RPC notifications the app SENDS to the host (app → host, no response).
 */
export const AppNotifications = {
  /** Sent once after `ui/initialize` resolves; unblocks host → app messages. */
  Initialized: "ui/notifications/initialized",
  /** Report the rendered content size so the host can size a flexible iframe. */
  SizeChanged: "ui/notifications/size-changed",
} as const;
export type AppNotification = (typeof AppNotifications)[keyof typeof AppNotifications];

/**
 * JSON-RPC notifications the host SENDS to the app (host → app, no response).
 * Per spec the host MUST NOT send any of these before it receives
 * `ui/notifications/initialized` from the app.
 */
export const HostNotifications = {
  /** Complete tool arguments for the tool that opened this view. */
  ToolInput: "ui/notifications/tool-input",
  /** Streaming/partial tool arguments (optional, may arrive before ToolInput). */
  ToolInputPartial: "ui/notifications/tool-input-partial",
  /** The result of the tool that opened this view (initial + subsequent). */
  ToolResult: "ui/notifications/tool-result",
  /** The host context changed (theme, display mode, container size, …). */
  HostContextChanged: "ui/notifications/host-context-changed",
} as const;
export type HostNotification = (typeof HostNotifications)[keyof typeof HostNotifications];

/** How a component can be displayed by the host. */
export type DisplayMode = "inline" | "fullscreen" | "pip";
