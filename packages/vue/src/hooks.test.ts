// @vitest-environment jsdom
import type { HostBridge } from "@mcpapps/client-core";
import type { ThemeState, ToolResultEnvelope } from "@mcpapps/protocol";
import { describe, expect, it, vi } from "vitest";
import { type App, createApp, defineComponent, h } from "vue";
import { BridgeKey } from "./bridge.js";
import { useCallTool, useTheme, useToolResult } from "./hooks.js";

/** A scriptable fake HostBridge exposing only what the hooks consume. */
function makeBridge(init: {
  result?: ToolResultEnvelope;
  theme?: ThemeState;
  callResult?: ToolResultEnvelope;
}) {
  let toolCb: ((e: ToolResultEnvelope) => void) | undefined;
  let themeCb: ((t: ThemeState) => void) | undefined;
  const callTool = vi.fn(async () => init.callResult ?? { toolName: "t", structuredContent: {} });
  const bridge = {
    getLatestToolResult: () => init.result,
    onToolResult: (cb: (e: ToolResultEnvelope) => void) => {
      toolCb = cb;
      return () => {
        toolCb = undefined;
      };
    },
    getTheme: () => init.theme,
    onTheme: (cb: (t: ThemeState) => void) => {
      themeCb = cb;
      return () => {
        themeCb = undefined;
      };
    },
    callTool,
  } as unknown as HostBridge;
  return {
    bridge,
    callTool,
    pushResult: (e: ToolResultEnvelope) => toolCb?.(e),
    pushTheme: (t: ThemeState) => themeCb?.(t),
  };
}

/** Mount a component whose setup runs `fn`, with the bridge provided. */
function mount<T>(bridge: HostBridge, fn: () => T): { value: T; app: App } {
  let value!: T;
  const Comp = defineComponent({
    setup() {
      value = fn();
      return () => h("div");
    },
  });
  const app = createApp(Comp);
  app.provide(BridgeKey, bridge);
  app.mount(document.createElement("div"));
  return { value, app };
}

describe("useToolResult", () => {
  it("seeds from the latest result and updates on new ones", () => {
    const h = makeBridge({ result: { toolName: "get_weather", structuredContent: { tempC: 5 } } });
    const { value: data } = mount(h.bridge, () => useToolResult<{ tempC: number }>());
    expect(data.value).toEqual({ tempC: 5 });

    h.pushResult({ toolName: "get_weather", structuredContent: { tempC: 9 } });
    expect(data.value).toEqual({ tempC: 9 });
  });

  it("is null when there is no prior result", () => {
    const h = makeBridge({});
    const { value: data } = mount(h.bridge, () => useToolResult());
    expect(data.value).toBeNull();
  });
});

describe("useCallTool", () => {
  it("invokes the bridge and unwraps structuredContent", async () => {
    const h = makeBridge({ callResult: { toolName: "get_weather", structuredContent: { ok: 1 } } });
    const { value: call } = mount(h.bridge, () => useCallTool("get_weather"));
    const out = await call({ city: "London" } as never);
    expect(out).toEqual({ ok: 1 });
    expect(h.callTool).toHaveBeenCalledWith("get_weather", { city: "London" });
  });
});

describe("useTheme", () => {
  it("seeds from the host theme and updates reactively", () => {
    const h = makeBridge({ theme: { colorScheme: "dark", tokens: {} } });
    const { value: theme } = mount(h.bridge, () => useTheme());
    expect(theme.value.colorScheme).toBe("dark");

    h.pushTheme({ colorScheme: "light", tokens: { "--x": "1" } });
    expect(theme.value).toEqual({ colorScheme: "light", tokens: { "--x": "1" } });
  });

  it("falls back to the default theme when the host has none", () => {
    const h = makeBridge({});
    const { value: theme } = mount(h.bridge, () => useTheme());
    expect(theme.value.colorScheme).toBe("light");
  });
});
