import type { CompiledComponent } from "@mcpapps/protocol";
import type { z } from "zod";

export type { CompiledComponent };

export interface ToolDefinition<
  I extends z.ZodTypeAny = z.ZodTypeAny,
  O extends z.ZodTypeAny = z.ZodTypeAny,
> {
  name: string;
  description?: string;
  inputSchema: I;
  outputSchema: O;
  /** The compiled component this tool renders. Omit for a headless tool. */
  ui?: CompiledComponent;
  handler: (args: z.infer<I>) => z.infer<O> | Promise<z.infer<O>>;
}

/**
 * The widened, storable form of a tool. Declared standalone (rather than
 * `ToolDefinition<ZodTypeAny, ZodTypeAny>`) so a specific `defineTool(...)`
 * assigns cleanly — the zod generic is invariant via the handler arg, so a
 * `ToolDefinition<ZodObject>` would otherwise not match `ToolDefinition<ZodTypeAny>`.
 */
export interface AnyToolDefinition {
  name: string;
  description?: string;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  ui?: CompiledComponent;
  // biome-ignore lint/suspicious/noExplicitAny: widened storage form.
  handler: (args: any) => any;
}

/** Preserves the input/output generics so handler args/returns stay typed. */
export function defineTool<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  def: ToolDefinition<I, O>,
): ToolDefinition<I, O> {
  return def;
}

export type RendererName = "vue" | "flutter" | (string & {});

export interface AppDefinition {
  name: string;
  version: string;
  renderer: RendererName;
  tools: AnyToolDefinition[];
  /** Mirror vendor-specific `_meta` keys (e.g. ChatGPT) for cross-host portability. */
  compat?: boolean;
}

export interface McpApp extends AppDefinition {
  /** Tools indexed by name for O(1) dispatch. */
  readonly toolMap: ReadonlyMap<string, AnyToolDefinition>;
  /** Compiled components indexed by their `ui://` uri. */
  readonly resourceMap: ReadonlyMap<string, CompiledComponent>;
}

export function defineApp(def: AppDefinition): McpApp {
  const toolMap = new Map<string, AnyToolDefinition>();
  const resourceMap = new Map<string, CompiledComponent>();
  for (const tool of def.tools) {
    if (toolMap.has(tool.name)) {
      throw new Error(`Duplicate tool name: ${tool.name}`);
    }
    toolMap.set(tool.name, tool);
    if (tool.ui) resourceMap.set(tool.ui.uri, tool.ui);
  }
  return { ...def, toolMap, resourceMap };
}

/**
 * Type helper: extract the `{ toolName: { input; output } }` registry from an
 * app definition, for renderers/clients that want end-to-end inference.
 */
export type InferToolMap<T extends { tools: readonly AnyToolDefinition[] }> = {
  [K in T["tools"][number]["name"]]: Extract<
    T["tools"][number],
    { name: K }
  > extends ToolDefinition<infer I, infer O>
    ? { input: z.infer<I>; output: z.infer<O> }
    : never;
};
