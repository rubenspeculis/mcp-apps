import { runCreate } from "./args.js";
import { buildCommand, deployCommand, devCommand, serveCommand } from "./commands.js";

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "create":
    await runCreate(rest);
    break;
  case "dev":
    await devCommand();
    break;
  case "serve":
    await serveCommand(rest);
    break;
  case "build":
    await buildCommand();
    break;
  case "deploy":
    await deployCommand();
    break;
  case undefined:
  case "--help":
  case "help":
    printHelp();
    break;
  default:
    console.error(`Unknown command: ${command}\n`);
    printHelp();
    process.exitCode = 1;
}

function printHelp(): void {
  console.log(`mcpapps — build MCP Apps

Commands:
  create <directory>   Scaffold a new MCP App project
  dev                  Serve the host emulator with live-reload (vue)
  serve [--stdio]      Run the MCP server (HTTP or stdio)
  build                Compile components
  deploy               Compile components and deploy to Cloudflare Workers

Run inside a project that has an mcpapps.config.ts (except "create").`);
}
