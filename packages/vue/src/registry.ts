/**
 * The typed tool registry. Empty by default — a generated module (or the app
 * author) augments it so `useToolResult<"my_tool">()` infers the right type:
 *
 *   declare module "@mcpapps/vue" {
 *     interface ToolRegistry {
 *       get_weather: { input: { city: string }; output: { tempC: number } };
 *     }
 *   }
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmentation target.
export interface ToolRegistry {}

/** Resolve a tool key (or an explicit shape) to its output type. */
export type ResolveOutput<R> = R extends keyof ToolRegistry
  ? ToolRegistry[R] extends { output: infer O }
    ? O
    : unknown
  : R;

/** Resolve a tool key (or an explicit shape) to its input type. */
export type ResolveInput<R> = R extends keyof ToolRegistry
  ? ToolRegistry[R] extends { input: infer I }
    ? I
    : unknown
  : R;
