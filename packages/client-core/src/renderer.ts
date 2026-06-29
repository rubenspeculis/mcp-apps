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
 * mount the renderer, run the `ui/initialize` handshake (which unblocks the
 * host's tool-result notifications), and report the rendered size so the host
 * can size a flexible iframe. Returns a teardown for the (rare) host that
 * unmounts views.
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
  await bridge.initialize();

  // Report the content size now and whenever it changes. Hosts that give the
  // iframe flexible dimensions (e.g. Claude: width:100%, no height) rely on
  // `ui/notifications/size-changed`; without it the iframe collapses to 0 px.
  const stopSizeReports = observeSize(root, (w, h) => bridge.reportSize(w, h));

  return {
    unmount() {
      stopSizeReports();
      handle.unmount();
      bridge.dispose();
    },
  };
}

/**
 * Report `el`'s content size now and on every change. Uses ResizeObserver when
 * available; otherwise reports once. Returns a disconnect function.
 */
function observeSize(el: HTMLElement, report: (width: number, height: number) => void): () => void {
  const emit = () => report(el.scrollWidth, el.scrollHeight);
  emit();
  if (typeof ResizeObserver === "undefined") return () => {};
  const observer = new ResizeObserver(() => emit());
  observer.observe(el);
  return () => observer.disconnect();
}
