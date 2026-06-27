import { runCreate } from "./args.js";

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "create":
    await runCreate(rest);
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

Run "mcpapps create --help" for options.`);
}
