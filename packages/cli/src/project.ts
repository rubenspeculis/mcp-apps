import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { CompiledComponent } from "@mcpapps/protocol";
import { createJiti } from "jiti";
import type { ComponentEntry, McpAppConfig } from "./config.js";

// Structural shapes keep project-local packages out of the CLI's dependency graph.
export type ProjectResource = Omit<CompiledComponent, "uri" | "html"> & {
  uri: string;
  html?: string;
};
export interface ProjectTool {
  name: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  ui?: ProjectResource;
}
export interface ProjectApp {
  name: string;
  renderer: string;
  tools?: ProjectTool[];
  resourceMap: Map<string, ProjectResource>;
}

interface Project {
  cwd: string;
  jiti: ReturnType<typeof createJiti>;
  config: McpAppConfig | undefined;
  entry: string;
  specs: ComponentEntry[];
}

export interface PreparedProject {
  app: ProjectApp;
  config: McpAppConfig | undefined;
  watchPaths: string[];
  /** Refresh resources without re-importing tool handlers. Failed builds publish nothing. */
  rebuild(): Promise<void>;
}

export function jitiFor(cwd: string) {
  return createJiti(resolve(cwd, "_cli.js"), { interopDefault: true, moduleCache: false });
}

async function readProject(cwd: string): Promise<Project> {
  const jiti = jitiFor(cwd);
  const configPath = resolve(cwd, "mcpapps.config.ts");
  let config: McpAppConfig | undefined;
  if (existsSync(configPath)) {
    const mod = await jiti.import<McpAppConfig | { default: McpAppConfig }>(configPath);
    config = "renderer" in mod ? mod : mod.default;
  }
  const entry = resolve(cwd, config?.app ?? "src/worker.ts");
  if (!config && !existsSync(entry)) {
    throw new Error(
      "Not an MCP App project – expected mcpapps.config.ts (vue) or src/worker.ts (flutter).",
    );
  }
  return {
    cwd,
    jiti,
    config,
    entry,
    specs: (config?.components ?? []).map((spec) => ({
      ...spec,
      entry: resolve(cwd, spec.entry),
    })),
  };
}

async function compile(project: Project): Promise<ProjectResource[]> {
  if (project.config?.renderer !== "vue") return [];
  const { writeComponentsModule } = await project.jiti.import<{
    writeComponentsModule: (
      specs: ComponentEntry[],
      output: string,
      options: { root: string },
    ) => Promise<ProjectResource[]>;
  }>("@mcpapps/vite-plugin-vue");
  const resources = await writeComponentsModule(
    project.specs,
    resolve(project.cwd, project.config.generated ?? "src/generated/components.ts"),
    { root: project.cwd },
  );
  if (
    resources.length !== project.specs.length ||
    resources.some((resource, i) => resource.uri !== project.specs[i]?.uri)
  ) {
    throw new Error("Compiler output does not match the declared UI resources");
  }
  return resources;
}

/** Build/deploy need generated output, but must not execute the app's module. */
export async function buildProject(cwd: string): Promise<void> {
  const project = await readProject(cwd);
  if (!project.config) {
    throw new Error("Flutter builds are explicit – run the project's pnpm build/deploy script.");
  }
  await compile(project);
}

/** Compile first, load the app second, then own every subsequent resource refresh. */
export async function prepareProject(
  cwd: string,
  requiredRenderer?: "vue",
): Promise<PreparedProject> {
  const project = await readProject(cwd);
  if (requiredRenderer && project.config?.renderer !== requiredRenderer) {
    throw new Error("`mcpapps dev` supports the vue renderer. For Flutter, run `pnpm start`.");
  }
  const resources = await compile(project);
  let app: ProjectApp;
  try {
    const mod = await project.jiti.import<{ app?: ProjectApp }>(project.entry);
    if (!mod.app) {
      throw new Error(`${project.entry} must export { app } (the defineApp result)`);
    }
    app = mod.app;
  } catch (error) {
    if (!project.config || project.config.renderer === "flutter") {
      throw new Error("Could not load the pre-built Flutter app – run pnpm build/deploy first.", {
        cause: error,
      });
    }
    throw error;
  }

  function publish(fresh: ProjectResource[]): void {
    // No await inside publication: request handlers see either the old build or
    // the complete new build, including metadata on every tool sharing a URI.
    for (const resource of fresh) app.resourceMap.set(resource.uri, resource);
    for (const tool of app.tools ?? []) {
      const resource = tool.ui && app.resourceMap.get(tool.ui.uri);
      if (resource) tool.ui = resource;
    }
  }
  publish(resources);

  // Serialise rebuilds so a slow older compilation cannot overwrite a newer one.
  let pending = Promise.resolve();
  return {
    app,
    config: project.config,
    watchPaths: project.config?.renderer === "vue" ? project.specs.map((spec) => spec.entry) : [],
    rebuild() {
      const next = pending.then(async () => publish(await compile(project)));
      pending = next.catch(() => {});
      return next;
    },
  };
}
