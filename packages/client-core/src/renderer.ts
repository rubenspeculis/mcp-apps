import { createHostBridge, type HostBridge } from "./host-bridge.js";

/** Handle returned after mounting, used to tear a component down. */
export interface RenderHandle {
  unmount(): void;
}

/**
 * The contract every renderer (Vue, Flutter, ...) implements. The bootstrap
 * (`mountApp`) constructs the HostBridge and hands it to the adapter, so a
 * renderer only has to know how to paint a tree given the bridge.
 */
export interface RendererAdapter {
  readonly name: string;
  mount(root: HTMLElement, bridge: HostBridge): Promise<RenderHandle> | RenderHandle;
}

export interface MountAppOptions {
  /** Where to mount. Defaults to `#root`, then `document.body`. */
  root?: HTMLElement;
  /** Inject a custom bridge (e.g. for tests). Defaults to a postMessage bridge. */
  bridge?: HostBridge;
}

/**
 * Standard entrypoint for a compiled `ui://` component: wire up the bridge,
 * mount the renderer, then tell the host we're ready (which flushes the queued
 * tool result). Returns a teardown for the (rare) host that unmounts views.
 */
export async function mountApp(
  adapter: RendererAdapter,
  options: MountAppOptions = {},
): Promise<RenderHandle> {
  const root =
    options.root ??
    (typeof document !== "undefined"
      ? (document.getElementById("root") ?? document.body)
      : undefined);
  if (!root) {
    throw new Error("mountApp could not find a root element to mount into.");
  }
  const bridge = options.bridge ?? createHostBridge();
  const handle = await adapter.mount(root, bridge);
  bridge.ready();
  return {
    unmount() {
      handle.unmount();
      bridge.dispose();
    },
  };
}
