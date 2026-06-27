import { runCreate } from "./args.js";

// `create-mcpapp <directory> [options]`
await runCreate(process.argv.slice(2));
