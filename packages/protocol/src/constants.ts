/**
 * Spec constants for the MCP Apps (SEP-1865) / mcp-ui contract.
 *
 * These values have churned across drafts and differ slightly between hosts
 * (Claude/mcp-ui vs ChatGPT/Apps SDK). Keeping every wire-level string in ONE
 * place means a spec change is a one-line edit, never a hunt across packages.
 */

/** MIME type marking an HTML resource as an MCP App component. */
export const MCP_APP_MIME = "text/html;profile=mcp-app" as const;

/** Scheme for UI resource URIs, e.g. `ui://weather-app/get_weather`. */
export const UI_SCHEME = "ui://" as const;

/**
 * JSON-RPC methods the app (iframe) may CALL on the host (app → host requests).
 */
export const HostMethods = {
  /** Invoke an MCP tool on the server and await its result. */
  CallTool: "tools/call",
  /** Ask the host to change how the component is displayed. */
  RequestDisplayMode: "ui/requestDisplayMode",
  /** Inject a follow-up prompt into the host conversation. */
  SendFollowupPrompt: "ui/sendFollowupPrompt",
} as const;
export type HostMethod = (typeof HostMethods)[keyof typeof HostMethods];

/**
 * JSON-RPC notifications the host SENDS to the app (host → app, no response).
 */
export const AppNotifications = {
  /** The result of the tool that opened this view (initial + subsequent). */
  ToolResult: "ui/notifications/tool-result",
  /** The host theme (light/dark + design tokens) changed. */
  Theme: "ui/notifications/theme",
  /** Lifecycle signals (e.g. the view is being suspended/closed). */
  Lifecycle: "ui/notifications/lifecycle",
} as const;
export type AppNotification = (typeof AppNotifications)[keyof typeof AppNotifications];

/**
 * JSON-RPC methods the app SENDS to the host as notifications (app → host).
 */
export const AppMethods = {
  /** The app has mounted and is ready to receive the queued tool result. */
  Ready: "ui/ready",
} as const;
export type AppMethod = (typeof AppMethods)[keyof typeof AppMethods];

/** How a component can be displayed by the host. */
export type DisplayMode = "inline" | "fullscreen" | "pip";
