import {
  type HostContext,
  HostMethods,
  HostNotifications,
  type JsonRpcMessage,
  type JsonRpcRequest,
  type ToolResultEnvelope,
} from "@mcpapps/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHostBridge, type HostBridge } from "./host-bridge.js";
import { createMockTransportPair, type Transport } from "./transport.js";

/** A tiny scriptable host that drives the host side of a mock transport pair. */
function makeHost(transport: Transport) {
  const requests: JsonRpcRequest[] = [];
  const notifications: JsonRpcMessage[] = [];
  transport.onMessage((m) => {
    if ("method" in m && "id" in m) requests.push(m as JsonRpcRequest);
    else if ("method" in m) notifications.push(m);
  });
  return {
    requests,
    notifications,
    notifyToolResult(env: ToolResultEnvelope) {
      transport.send({ jsonrpc: "2.0", method: HostNotifications.ToolResult, params: env });
    },
    notifyHostContext(ctx: HostContext) {
      transport.send({ jsonrpc: "2.0", method: HostNotifications.HostContextChanged, params: ctx });
    },
    notifyToolInput(args: Record<string, unknown>) {
      transport.send({
        jsonrpc: "2.0",
        method: HostNotifications.ToolInput,
        params: { arguments: args },
      });
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

  it("delivers tool-input notifications to subscribers", async () => {
    const seen = vi.fn();
    bridge.onToolInput(seen);
    host.notifyToolInput({ city: "Berlin" });
    await vi.waitFor(() => expect(seen).toHaveBeenCalledWith({ city: "Berlin" }));
  });

  it("starts at the default light theme and replays it on subscribe", () => {
    const seen = vi.fn();
    bridge.onTheme(seen);
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ colorScheme: "light" }));
    expect(bridge.getTheme().colorScheme).toBe("light");
  });

  it("updates theme + tokens on a host-context-changed notification", async () => {
    host.notifyHostContext({ theme: "dark", styles: { variables: { "--bg": "#000" } } });
    await vi.waitFor(() => expect(bridge.getTheme().colorScheme).toBe("dark"));
    expect(bridge.getTheme().tokens).toEqual({ "--bg": "#000" });
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

  it("runs the ui/initialize handshake then sends initialized", async () => {
    const done = bridge.initialize();
    await vi.waitFor(() => expect(host.requests).toHaveLength(1));
    const req = host.requests[0];
    expect(req?.method).toBe(HostMethods.Initialize);

    host.respond(req?.id as number, {
      protocolVersion: "2026-01-26",
      hostContext: { theme: "dark" },
    });
    await done;

    expect(bridge.getTheme().colorScheme).toBe("dark");
    expect(
      host.notifications.some((m) => "method" in m && m.method === HostNotifications.ToolResult),
    ).toBe(false);
    expect(
      host.notifications.some((m) => "method" in m && m.method === "ui/notifications/initialized"),
    ).toBe(true);
  });

  it("falls back and reports the initialize timeout", async () => {
    const pair = createMockTransportPair();
    const timeoutHost = makeHost(pair.host);
    const onInitializeFallback = vi.fn();
    const timedBridge = createHostBridge({
      transport: pair.app,
      initializeTimeoutMs: 1,
      onInitializeFallback,
    });

    const result = await timedBridge.initialize();

    expect(result.protocolVersion).toBe("2026-01-26");
    expect(onInitializeFallback).toHaveBeenCalledWith(expect.any(Error));
    expect(timeoutHost.requests[0]?.method).toBe(HostMethods.Initialize);
    expect(
      timeoutHost.notifications.some(
        (m) => "method" in m && m.method === "ui/notifications/initialized",
      ),
    ).toBe(true);
    timedBridge.dispose();
  });

  it("reports size via ui/notifications/size-changed", async () => {
    bridge.reportSize(420, 260);
    await vi.waitFor(() =>
      expect(
        host.notifications.some(
          (m) => "method" in m && m.method === "ui/notifications/size-changed",
        ),
      ).toBe(true),
    );
    const sized = host.notifications.find(
      (m) => "method" in m && m.method === "ui/notifications/size-changed",
    ) as JsonRpcMessage & { params?: { width: number; height: number } };
    expect(sized?.params).toEqual({ width: 420, height: 260 });
  });
});
