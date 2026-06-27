import type { JsonRpcMessage } from "@mcpapps/protocol";

export type Unsubscribe = () => void;

/**
 * A bidirectional channel carrying JSON-RPC messages between the app (iframe)
 * and its host. The HostBridge is the only consumer; swapping the transport is
 * how the emulator and tests stand in for a real host without the bridge ever
 * knowing the difference.
 */
export interface Transport {
  send(message: JsonRpcMessage): void;
  onMessage(handler: (message: JsonRpcMessage) => void): Unsubscribe;
  close(): void;
}

/**
 * Default transport: posts to `window.parent` and listens on the current
 * window's `message` events — the mcp-ui sandboxed-iframe contract.
 */
export function createPostMessageTransport(options?: {
  target?: Window;
  targetOrigin?: string;
}): Transport {
  if (typeof window === "undefined") {
    throw new Error(
      "createPostMessageTransport requires a browser window. Use a mock transport in non-DOM environments.",
    );
  }
  const target = options?.target ?? window.parent;
  const targetOrigin = options?.targetOrigin ?? "*";
  const handlers = new Set<(message: JsonRpcMessage) => void>();

  const onWindowMessage = (event: MessageEvent) => {
    const data = event.data as unknown;
    if (!isLikelyJsonRpc(data)) return;
    for (const handler of handlers) handler(data as JsonRpcMessage);
  };
  window.addEventListener("message", onWindowMessage);

  return {
    send(message) {
      target.postMessage(message, targetOrigin);
    },
    onMessage(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {
      handlers.clear();
      window.removeEventListener("message", onWindowMessage);
    },
  };
}

/**
 * An in-memory pair of transports wired to each other. `app` is handed to the
 * HostBridge; `host` is driven by the emulator (or a test) to simulate a host.
 * Delivery is async (microtask) to mirror real postMessage ordering.
 */
export function createMockTransportPair(): { app: Transport; host: Transport } {
  const appHandlers = new Set<(message: JsonRpcMessage) => void>();
  const hostHandlers = new Set<(message: JsonRpcMessage) => void>();

  const deliver = (handlers: Set<(m: JsonRpcMessage) => void>, message: JsonRpcMessage) => {
    queueMicrotask(() => {
      for (const handler of handlers) handler(message);
    });
  };

  const app: Transport = {
    send: (message) => deliver(hostHandlers, message),
    onMessage: (handler) => {
      appHandlers.add(handler);
      return () => appHandlers.delete(handler);
    },
    close: () => appHandlers.clear(),
  };
  const host: Transport = {
    send: (message) => deliver(appHandlers, message),
    onMessage: (handler) => {
      hostHandlers.add(handler);
      return () => hostHandlers.delete(handler);
    },
    close: () => hostHandlers.clear(),
  };
  return { app, host };
}

function isLikelyJsonRpc(data: unknown): boolean {
  return (
    typeof data === "object" && data !== null && (data as { jsonrpc?: unknown }).jsonrpc === "2.0"
  );
}
