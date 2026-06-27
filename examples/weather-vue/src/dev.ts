import { serveEmulator, startCloudflareTunnel } from "@mcpapps/dev";
import { app } from "./app.js";

const port = Number(process.env.PORT ?? 5179);
const emulator = await serveEmulator(app, { port });
console.log(`\n  ▸ emulator   ${emulator.url}`);
console.log(`  ▸ mcp        ${emulator.url}/mcp\n`);

if (process.argv.includes("--tunnel")) {
  try {
    const tunnel = await startCloudflareTunnel({ port });
    console.log(`  ▸ public     ${tunnel.url}`);
    console.log(`  ▸ public mcp ${tunnel.url}/mcp  (point a real host here)\n`);
  } catch (err) {
    console.error(`  ✗ tunnel failed: ${(err as Error).message}\n`);
  }
}
