/**
 * @mcpapps/client-core — the renderer-agnostic runtime that runs inside the
 * `ui://` iframe. Owns the only postMessage JSON-RPC peer in the framework.
 */
export {
  type CreateHostBridgeOptions,
  createHostBridge,
  type HostBridge,
} from "./host-bridge.js";
export {
  type MountAppOptions,
  mountApp,
  type RendererAdapter,
  type RenderHandle,
} from "./renderer.js";
export {
  createMockTransportPair,
  createPostMessageTransport,
  type Transport,
  type Unsubscribe,
} from "./transport.js";
