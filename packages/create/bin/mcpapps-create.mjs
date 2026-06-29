#!/usr/bin/env node
// `pnpm create @mcpapps <dir>` resolves @mcpapps/create and runs this bin. The
// real scaffolding lives in @mcpapps/cli's public `createApp`; this is a thin
// entry that parses flags and delegates, so the logic has a single home.
import { createApp } from "@mcpapps/cli";

const argv = process.argv.slice(2);
const positionals = [];
const flags = {};
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i] ?? "";
  if (arg.startsWith("--")) {
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
    } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
      flags[body] = argv[++i];
    } else {
      flags[body] = true;
    }
  } else {
    positionals.push(arg);
  }
}

const targetDir = positionals[0];
if (!targetDir || flags.help) {
  console.log(`pnpm create @mcpapps <directory> [options]

Options:
  --renderer <vue|flutter>   Renderer to scaffold (default: vue)
  --name <name>              Package name (default: directory name)
  --force                    Scaffold into a non-empty directory
  --help                     Show this help`);
  process.exit(targetDir || flags.help ? 0 : 1);
}

const renderer = flags.renderer ?? "vue";
if (renderer !== "vue" && renderer !== "flutter") {
  console.error(`Unknown renderer: ${renderer} (expected "vue" or "flutter")`);
  process.exit(1);
}

const result = await createApp({
  targetDir,
  renderer,
  ...(typeof flags.name === "string" ? { name: flags.name } : {}),
  force: flags.force === true,
});

console.log(`\n  Created ${result.renderer} MCP App "${result.name}" in ${result.dir}`);
console.log(`  ${result.files.length} files written.\n`);
console.log("  Next steps:");
console.log(`    cd ${targetDir}`);
console.log("    pnpm install");
console.log(renderer === "flutter" ? "    pnpm start\n" : "    pnpm dev\n");
