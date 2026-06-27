import { DEFAULT_THEME, type ThemeState } from "@mcpapps/protocol";
import { onUnmounted, type Ref, ref, type ShallowRef, shallowRef } from "vue";
import { injectBridge } from "./bridge.js";
import type { ResolveInput, ResolveOutput, ToolRegistry } from "./registry.js";

/**
 * Reactive `structuredContent` of the latest tool result. Replays the existing
 * result on mount, then updates whenever the host pushes a new one.
 *
 *   const data = useToolResult<"get_weather">(); // Ref<{ tempC: number } | null>
 */
export function useToolResult<R = unknown>(): Ref<ResolveOutput<R> | null> {
  const bridge = injectBridge();
  const initial =
    (bridge.getLatestToolResult()?.structuredContent as ResolveOutput<R> | undefined) ?? null;
  const data = shallowRef(initial) as ShallowRef<ResolveOutput<R> | null>;
  const unsub = bridge.onToolResult((env) => {
    data.value = env.structuredContent as ResolveOutput<R>;
  });
  onUnmounted(unsub);
  return data;
}

/**
 * Returns a typed function that invokes a tool on the server.
 *
 *   const refresh = useCallTool("get_weather");
 *   await refresh({ city: "London" }); // typed args + result
 */
export function useCallTool<R extends keyof ToolRegistry | string = string>(
  name: R,
): (args: ResolveInput<R>) => Promise<ResolveOutput<R>> {
  const bridge = injectBridge();
  return async (args: ResolveInput<R>) => {
    const env = await bridge.callTool<ResolveInput<R>, ResolveOutput<R>>(name as string, args);
    return env.structuredContent;
  };
}

/** Reactive host theme (light/dark + tokens). */
export function useTheme(): Ref<ThemeState> {
  const bridge = injectBridge();
  const theme = ref<ThemeState>(bridge.getTheme() ?? DEFAULT_THEME);
  const unsub = bridge.onTheme((t) => {
    theme.value = t;
  });
  onUnmounted(unsub);
  return theme;
}
