import {
  AppNotifications,
  HostMethods,
  type JsonRpcMessage,
  type JsonRpcRequest,
  type ThemeState,
  type ToolResultEnvelope,
} from "@mcpapps/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHostBridge, type HostBridge } from "./host-bridge.js";
import { createMockTransportPair, type Transport } from "./transport.js";

/** A tiny scriptable host that drives the host side of a mock transport pair. */
function makeHost(transport: Transport) {
  const requests: JsonRpcRequest[] = [];
  transport.onMessage((m) => {
    if ("method" in m && "id" in m) requests.push(m as JsonRpcRequest);
  });
  return {
    requests,
    notifyToolResult(env: ToolResultEnvelope) {
      transport.send({ jsonrpc: "2.0", method: AppNotifications.ToolResult, params: env });
    },
    notifyTheme(theme: ThemeState) {
      transport.send({ jsonrpc: "2.0", method: AppNotifications.Theme, params: theme });
    },
    respond(id: number, result: unknown) {
      transport.send({ jsonrpc: "2.0", id, result } as JsonRpcMessage);
    },
    respondError(id: number, message: string) {
      transport.send({
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message },
      } as JsonRpcMessage);
    },
  };
}

describe("createHostBridge", () => {
  let bridge: HostBridge;
  let host: ReturnType<typeof makeHost>;

  beforeEach(() => {
    const pair = createMockTransportPair();
    host = makeHost(pair.host);
    bridge = createHostBridge({ transport: pair.app });
  });

  it("delivers a tool-result notification to subscribers", async () => {
    const seen = vi.fn();
    bridge.onToolResult(seen);
    host.notifyToolResult({ toolName: "get_weather", structuredContent: { tempC: 21 } });
    await vi.waitFor(() => expect(seen).toHaveBeenCalledOnce());
    expect(seen).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "get_weather", structuredContent: { tempC: 21 } }),
    );
  });

  it("replays the latest tool result to a late subscriber", async () => {
    host.notifyToolResult({ toolName: "get_weather", structuredContent: { tempC: 9 } });
    await vi.waitFor(() => expect(bridge.getLatestToolResult()).not.toBeNull());

    const late = vi.fn();
    bridge.onToolResult(late);
    // Replay is synchronous on subscribe — no waiting needed.
    expect(late).toHaveBeenCalledWith(expect.objectContaining({ structuredContent: { tempC: 9 } }));
  });

  it("starts at the default light theme and replays it on subscribe", () => {
    const seen = vi.fn();
    bridge.onTheme(seen);
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ colorScheme: "light" }));
    expect(bridge.getTheme().colorScheme).toBe("light");
  });

  it("updates theme on a theme notification", async () => {
    host.notifyTheme({ colorScheme: "dark", tokens: { "--bg": "#000" } });
    await vi.waitFor(() => expect(bridge.getTheme().colorScheme).toBe("dark"));
  });

  it("correlates a callTool request with its response", async () => {
    const promise = bridge.callTool<{ city: string }, { tempC: number }>("get_weather", {
      city: "London",
    });
    await vi.waitFor(() => expect(host.requests).toHaveLength(1));

    const req = host.requests[0];
    expect(req?.method).toBe(HostMethods.CallTool);
    expect(req?.params).toEqual({ name: "get_weather", arguments: { city: "London" } });

    host.respond(req?.id as number, { structuredContent: { tempC: 14 } });
    const env = await promise;
    expect(env.structuredContent).toEqual({ tempC: 14 });
    expect(env.toolName).toBe("get_weather");
  });

  it("also refreshes onToolResult subscribers when callTool resolves", async () => {
    const seen = vi.fn();
    bridge.onToolResult(seen);
    const promise = bridge.callTool("get_weather", { city: "Paris" });
    await vi.waitFor(() => expect(host.requests).toHaveLength(1));
    host.respond(host.requests[0]?.id as number, { structuredContent: { tempC: 18 } });
    await promise;
    expect(seen).toHaveBeenCalledWith(
      expect.objectContaining({ structuredContent: { tempC: 18 } }),
    );
  });

  it("rejects callTool on an error response", async () => {
    const promise = bridge.callTool("get_weather", { city: "Nowhere" });
    await vi.waitFor(() => expect(host.requests).toHaveLength(1));
    host.respondError(host.requests[0]?.id as number, "no such city");
    await expect(promise).rejects.toThrow("no such city");
  });

  it("sends a ready notification", async () => {
    const seen: JsonRpcMessage[] = [];
    // Re-wire a host that records all messages (not just requests).
    const pair = createMockTransportPair();
    pair.host.onMessage((m) => seen.push(m));
    const b = createHostBridge({ transport: pair.app });
    b.ready();
    await vi.waitFor(() =>
      expect(seen.some((m) => "method" in m && m.method === "ui/ready")).toBe(true),
    );
  });
});
