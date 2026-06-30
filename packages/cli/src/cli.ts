import { runCreate } from "./args.js";
import { auditCommand } from "./audit.js";
import { buildCommand, deployCommand, devCommand, serveCommand } from "./commands.js";

type CliCommand = {
  summary: string;
  usage: string;
  run: (argv: string[]) => Promise<void>;
};

const commands: Record<string, CliCommand> = {
  create: {
    summary: "Scaffold a new MCP App project",
    usage: "create <directory> [options]",
    run: runCreate,
  },
  dev: {
    summary: "Serve the host emulator with live-reload (vue)",
    usage: "dev",
    run: async () => devCommand(),
  },
  serve: {
    summary: "Run the MCP server (HTTP or stdio)",
    usage: "serve [--stdio]",
    run: serveCommand,
  },
  build: {
    summary: "Compile components",
    usage: "build",
    run: async () => buildCommand(),
  },
  audit: {
    summary: "Validate the app conforms to the MCP Apps spec",
    usage: "audit [--static-only | --runtime]",
    run: auditCommand,
  },
  deploy: {
    summary: "Compile components and deploy to Cloudflare Workers",
    usage: "deploy",
    run: async () => deployCommand(),
  },
};

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "help") {
    printHelp();
    return;
  }

  const spec = commands[command];
  if (!spec) {
    console.error(`Unknown command: ${command}\n`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if ((rest.includes("--help") || rest.includes("help")) && command !== "create") {
    printCommandHelp(command, spec);
    return;
  }

  await spec.run(rest);
}

function printHelp(): void {
  const rows = Object.entries(commands)
    .map(([name, spec]) => `  ${name.padEnd(8)} ${spec.summary}`)
    .join("\n");

  console.log(`mcpapps — build MCP Apps

Commands:
${rows}

Run "mcpapps <command> --help" for command-specific usage.
Run inside a project that has an mcpapps.config.ts (except "create").`);
}

function printCommandHelp(_name: string, spec: CliCommand): void {
  console.log(`Usage: mcpapps ${spec.usage}\n\n${spec.summary}`);
}

await runCli();
