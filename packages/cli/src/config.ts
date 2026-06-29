import type { Renderer } from "./templates.js";

/** CSP origin allowlists folded into the sandbox iframe's CSP (see ext-apps spec). */
export interface McpUiResourceCsp {
  connectDomains?: string[];
  resourceDomains?: string[];
  frameDomains?: string[];
  baseUriDomains?: string[];
}

/** Browser capability requests; presence (empty object) requests the capability. */
export interface McpUiPermissions {
  camera?: Record<string, never>;
  microphone?: Record<string, never>;
  geolocation?: Record<string, never>;
  clipboardWrite?: Record<string, never>;
}

export interface ComponentEntry {
  /** Export name in the generated components module. */
  name: string;
  /** Path to the component source (relative to the project root). */
  entry: string;
  /** The `ui://` URI this component is served at. */
  uri: string;
  title?: string;
  /** CSP allowlists emitted into the component's `_meta.ui.csp`. */
  csp?: McpUiResourceCsp;
  /** Browser capability requests emitted into `_meta.ui.permissions`. */
  permissions?: McpUiPermissions;
  /** Dedicated sandbox origin, emitted into `_meta.ui.domain`. */
  domain?: string;
  /** Border preference, emitted into `_meta.ui.prefersBorder`. */
  prefersBorder?: boolean;
}

export interface McpAppConfig {
  renderer: Renderer;
  /** Module exporting `app` (the defineApp result). Relative to project root. */
  app: string;
  /** Vue: components to compile. */
  components?: ComponentEntry[];
  /** Vue: where the generated components module is written. */
  generated?: string;
  /** Default emulator port. */
  port?: number;
}

/** Identity helper for type-safe `mcpapps.config.ts` files. */
export function defineConfig(config: McpAppConfig): McpAppConfig {
  return config;
}
