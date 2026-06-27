import type { HostBridge, RendererAdapter, RenderHandle } from "@mcpapps/client-core";
import { type Component, createApp } from "vue";
import { BridgeKey } from "./bridge.js";

/**
 * Build a RendererAdapter that mounts a Vue component as the iframe root,
 * providing the HostBridge so the component's hooks can reach the host.
 */
export function createVueAdapter(rootComponent: Component): RendererAdapter {
  return {
    name: "vue",
    mount(root: HTMLElement, bridge: HostBridge): RenderHandle {
      const app = createApp(rootComponent);
      app.provide(BridgeKey, bridge);
      app.mount(root);
      return { unmount: () => app.unmount() };
    },
  };
}
