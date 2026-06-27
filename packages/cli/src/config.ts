import type { Renderer } from "./templates.js";

export interface ComponentEntry {
  /** Export name in the generated components module. */
  name: string;
  /** Path to the component source (relative to the project root). */
  entry: string;
  /** The `ui://` URI this component is served at. */
  uri: string;
  title?: string;
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
