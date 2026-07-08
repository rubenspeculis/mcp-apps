import type { McpUiResourceCsp } from "./messages.js";

/** Hosts this monorepo has explicit, encoded knowledge about. */
export type HostId = "claude" | "chatgpt";

/**
 * What a specific MCP Apps host requires or understands, as data instead of
 * scattered comments. Consumed by the server (vendor `_meta` mirroring) and the
 * CLI's `mcpapps audit --host <id>` to validate against a host's actual
 * contract rather than a generic, host-agnostic check.
 */
export interface HostProfile {
  id: HostId;
  displayName: string;
  delivery: {
    /**
     * The host cannot fetch sibling assets — a UI resource must be one
     * self-contained HTML document (`html`/`htmlAsset`), never `basePath`.
     */
    requiresSingleFile: boolean;
    /**
     * Known maximum byte size for the inline HTML payload, if the host
     * enforces one. `undefined` = no documented limit — do not invent a
     * number; confirm against the host's actual behavior before setting this.
     */
    maxHtmlBytes?: number;
  };
  /**
   * Maps a spec CSP bucket to this host's vendor-specific metadata key. A
   * bucket absent from this map has no known equivalent on the host — the
   * server drops it when mirroring, and the audit warns if a component
   * declares it while targeting this host.
   */
  cspKeyMap: Partial<Record<keyof McpUiResourceCsp, string>>;
  /** Vendor `_meta` mirror keys this host expects beyond the spec's `ui` block. */
  metaKeys?: {
    /** e.g. ChatGPT `openai/outputTemplate` — value is the resource's `ui://` uri. */
    outputTemplate?: string;
    /** e.g. ChatGPT `openai/widgetCSP` — value is a `cspKeyMap`-shaped object. */
    widgetCsp?: string;
    /** e.g. mcp-ui `mcpui.dev/ui-resource-uri`. */
    uiResourceUri?: string;
  };
}

export const HOST_PROFILES: Record<HostId, HostProfile> = {
  claude: {
    id: "claude",
    displayName: "Claude",
    // No documented byte-size limit exists today; leave maxHtmlBytes unset
    // rather than guessing — confirm against real host behavior first.
    delivery: { requiresSingleFile: true },
    // Claude consumes McpUiResourceCsp as-is; no vendor CSP mirror key.
    cspKeyMap: {},
  },
  chatgpt: {
    id: "chatgpt",
    displayName: "ChatGPT",
    delivery: { requiresSingleFile: false },
    cspKeyMap: {
      connectDomains: "connect_domains",
      resourceDomains: "resource_domains",
      // frameDomains / baseUriDomains intentionally omitted: ChatGPT's
      // openai/widgetCSP has no known equivalent bucket for either today.
    },
    metaKeys: {
      outputTemplate: "openai/outputTemplate",
      widgetCsp: "openai/widgetCSP",
      uiResourceUri: "mcpui.dev/ui-resource-uri",
    },
  },
};
