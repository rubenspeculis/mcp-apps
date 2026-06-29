import { createApp } from "./create.js";
import type { Renderer } from "./templates.js";

export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

/** Minimal flag parser: `--key value`, `--key=value`, and boolean `--flag`. */
export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) {
          flags[body] = next;
          i++;
        } else {
          flags[body] = true;
        }
      }
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags };
}

/** Run the `create` command from a parsed arg list. Shared by both binaries. */
export async function runCreate(argv: string[]): Promise<void> {
  const { positionals, flags } = parseArgs(argv);
  const targetDir = positionals[0];
  if (!targetDir || flags.help) {
    printCreateHelp();
    if (!targetDir) process.exitCode = flags.help ? 0 : 1;
    return;
  }

  const renderer = (flags.renderer as Renderer) ?? "vue";
  if (renderer !== "vue" && renderer !== "flutter") {
    console.error(`Unknown renderer: ${renderer} (expected "vue" or "flutter")`);
    process.exitCode = 1;
    return;
  }

  const result = await createApp({
    targetDir,
    renderer,
    ...(typeof flags.name === "string" ? { name: flags.name } : {}),
    ...(typeof flags.dep === "string" ? { dep: flags.dep } : {}),
    ...(typeof flags["bridge-dep"] === "string" ? { bridgeDep: flags["bridge-dep"] } : {}),
    force: flags.force === true,
  });

  console.log(`\n  Created ${result.renderer} MCP App "${result.name}" in ${result.dir}`);
  console.log(`  ${result.files.length} files written.\n`);
  console.log("  Next steps:");
  console.log(`    cd ${targetDir}`);
  console.log("    pnpm install");
  console.log(renderer === "flutter" ? "    pnpm start\n" : "    pnpm dev\n");
}

function printCreateHelp(): void {
  console.log(`create-mcpapp <directory> [options]

Options:
  --renderer <vue|flutter>   Renderer to scaffold (default: vue)
  --name <name>              Package name (default: directory name)
  --dep <spec>               @mcpapps/* dependency spec (default: auto)
  --bridge-dep <yaml>        Flutter mcpapps_bridge pubspec dep block (default: auto)
  --force                    Scaffold into a non-empty directory
  --help                     Show this help`);
}
