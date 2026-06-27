import type { DisplayMode } from "./constants.js";

/** A `ui://` resource URI. */
export type UiResourceUri = `ui://${string}`;

/**
 * Normalized `_meta` block written onto a tool to bind it to its UI component.
 * Hosts read `_meta.ui.resourceUri` to know which resource to render.
 */
export interface UiMeta {
  resourceUri: UiResourceUri;
  /** Hints for how the host should frame the component. */
  preferredFrame?: {
    initialHeight?: number;
    resizable?: boolean;
  };
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

/** Theme state pushed via `ui/notifications/theme`. */
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

/** Params for `ui/requestDisplayMode`. */
export interface RequestDisplayModeParams {
  mode: DisplayMode;
}

/** Params for `ui/sendFollowupPrompt`. */
export interface SendFollowupPromptParams {
  prompt: string;
}

export const DEFAULT_THEME: ThemeState = {
  colorScheme: "light",
  tokens: {},
};
