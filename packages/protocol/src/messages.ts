import type { DisplayMode } from "./constants.js";
import type { JsonRpcId } from "./jsonrpc.js";

/** A `ui://` resource URI. */
export type UiResourceUri = `ui://${string}`;

/**
 * CSP origin allowlists a UI resource declares; the host folds them into the
 * sandbox iframe's Content-Security-Policy. All arrays of origin strings;
 * wildcard subdomains (`https://*.example.com`) are allowed. Omitted/empty =
 * no external access (the secure default).
 */
export interface McpUiResourceCsp {
  /** `connect-src` — fetch/XHR/WebSocket targets. */
  connectDomains?: string[];
  /** `script-src`/`style-src`/`img-src`/`font-src`/`media-src` — static assets. */
  resourceDomains?: string[];
  /** `frame-src` — nested iframe origins. */
  frameDomains?: string[];
  /** `base-uri` — allowed `<base href>` origins. */
  baseUriDomains?: string[];
}

/** Browser capability requests; presence (an empty object) requests it. */
export interface McpUiPermissions {
  camera?: Record<string, never>;
  microphone?: Record<string, never>;
  geolocation?: Record<string, never>;
  clipboardWrite?: Record<string, never>;
}

/**
 * Normalized `_meta.ui` block. Hosts read `resourceUri` to know which resource
 * to render; the remaining fields are the spec's `_meta.ui.csp`/`permissions`/
 * `domain`/`prefersBorder` declarations the host uses to build the sandbox.
 */
export interface UiMeta {
  resourceUri: UiResourceUri;
  csp?: McpUiResourceCsp;
  permissions?: McpUiPermissions;
  /** Request a stable, dedicated sandbox origin (OAuth/CORS needs). */
  domain?: string;
  /** Hint that the host should draw a visual border around the component. */
  prefersBorder?: boolean;
}

export interface ToolMetaWithUi {
  ui: UiMeta;
  /** Vendor-specific mirror keys (e.g. ChatGPT `openai/outputTemplate`). */
  [vendorKey: string]: unknown;
}

/**
 * A renderer-compiled UI component: the build artifact a renderer's build step
 * produces and the server serves. Shared shape so the server (consumer) and the
 * renderer build tooling (producer) never disagree on it.
 */
export interface CompiledComponent {
  uri: UiResourceUri;
  html: string;
  /** Optional extra resources (e.g. Flutter/CanvasKit assets) keyed by sub-path. */
  assets?: Record<string, { body: string | Uint8Array; mimeType: string }>;
  /**
   * Path the component + its assets are served from, with leading/trailing
   * slashes (e.g. `/_c/weather/`). Set for asset-bundled renderers (Flutter)
   * whose multi-file output cannot be inlined into a single srcdoc string; the
   * host loads such a component via an iframe `src` rather than `srcdoc`.
   */
  basePath?: string;
  /** CSP allowlists emitted into `_meta.ui.csp` (+ `openai/widgetCSP` compat). */
  csp?: McpUiResourceCsp;
  /** Capability requests emitted into `_meta.ui.permissions`. */
  permissions?: McpUiPermissions;
  /** Dedicated sandbox origin, emitted into `_meta.ui.domain`. */
  domain?: string;
  /** Border preference, emitted into `_meta.ui.prefersBorder`. */
  prefersBorder?: boolean;
}

// --- Lifecycle: ui/initialize handshake (app -> host request + response) ---

/** Capabilities the app advertises in `ui/initialize`. */
export interface AppCapabilities {
  experimental?: Record<string, unknown>;
  tools?: { listChanged?: boolean };
  availableDisplayModes?: DisplayMode[];
}

export interface ClientInfo {
  name: string;
  version: string;
}

/** Params for the `ui/initialize` request (app -> host). */
export interface InitializeParams {
  appCapabilities: AppCapabilities;
  clientInfo: ClientInfo;
  protocolVersion: string;
}

export interface HostCapabilities {
  experimental?: Record<string, unknown>;
  openLinks?: Record<string, never>;
  serverTools?: { listChanged?: boolean };
  serverResources?: { listChanged?: boolean };
  logging?: Record<string, never>;
  sandbox?: { permissions?: McpUiPermissions; csp?: McpUiResourceCsp };
}

export interface HostInfo {
  name: string;
  version: string;
}

/** Container size hints from the host (any combination of fixed/max bounds). */
export interface ContainerDimensions {
  height?: number;
  maxHeight?: number;
  width?: number;
  maxWidth?: number;
}

/** The render context the host hands the app in the `ui/initialize` response. */
export interface HostContext {
  toolInfo?: { id?: JsonRpcId; tool?: unknown };
  theme?: "light" | "dark";
  styles?: {
    variables?: Record<string, string | undefined>;
    css?: { fonts?: string };
  };
  displayMode?: DisplayMode;
  availableDisplayModes?: string[];
  containerDimensions?: ContainerDimensions;
  locale?: string;
  timeZone?: string;
  userAgent?: string;
  platform?: "web" | "desktop" | "mobile";
  deviceCapabilities?: { touch?: boolean; hover?: boolean };
  safeAreaInsets?: { top: number; right: number; bottom: number; left: number };
}

/** Result of the `ui/initialize` request (host -> app). */
export interface InitializeResult {
  protocolVersion: string;
  hostCapabilities?: HostCapabilities;
  hostInfo?: HostInfo;
  hostContext?: HostContext;
}

/** Params for `ui/notifications/size-changed` (app -> host). */
export interface SizeChangedParams {
  width: number;
  height: number;
}

/** Params for `ui/notifications/tool-input(-partial)` (host -> app). */
export interface ToolInputParams {
  arguments: Record<string, unknown>;
}

/**
 * The payload pushed to the iframe via `ui/notifications/tool-result`.
 * `structuredContent` is the typed output matching the tool's output schema.
 */
export interface ToolResultEnvelope<TOutput = unknown> {
  toolName: string;
  structuredContent: TOutput;
  /** Raw MCP content blocks, if the host forwards them. */
  content?: unknown[];
  isError?: boolean;
}

/**
 * Normalized theme state. Derived by the bridge from the host context's
 * `theme` + `styles.variables` (the host delivers these via the initialize
 * response and `ui/notifications/host-context-changed`).
 */
export interface ThemeState {
  colorScheme: "light" | "dark";
  /** CSS custom-property style design tokens (name -> value). */
  tokens: Record<string, string>;
}

/** Params for the `tools/call` request (app -> host). */
export interface CallToolParams<TArgs = unknown> {
  name: string;
  arguments: TArgs;
}

/** Params for `ui/request-display-mode` (app -> host). */
export interface RequestDisplayModeParams {
  mode: DisplayMode;
}

/** Params for `ui/message` (app -> host). */
export interface UiMessageParams {
  role: "user";
  content: { type: "text"; text: string };
}

export const DEFAULT_THEME: ThemeState = {
  colorScheme: "light",
  tokens: {},
};
