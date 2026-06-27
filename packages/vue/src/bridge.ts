import type { HostBridge } from "@mcpapps/client-core";
import { type InjectionKey, inject } from "vue";

export const BridgeKey: InjectionKey<HostBridge> = Symbol("mcpapps:bridge");

/** Resolve the HostBridge provided by the Vue adapter. Throws if missing. */
export function injectBridge(): HostBridge {
  const bridge = inject(BridgeKey, null);
  if (!bridge) {
    throw new Error(
      "No MCP HostBridge found. A component must be mounted via createVueAdapter / mountApp.",
    );
  }
  return bridge;
}
