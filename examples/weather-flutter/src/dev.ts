import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveEmulator, startCloudflareTunnel } from "@mcpapps/dev";
import { buildFlutterComponent } from "@mcpapps/flutter";
import { defineApp, defineTool } from "@mcpapps/server";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const flutterBin = process.env.FLUTTER_BIN ?? "flutter";

console.log("Building Flutter component (this can take a minute on a cold cache)…");
const weatherCard = await buildFlutterComponent({
  projectDir: resolve(root, "flutter"),
  uri: "ui://weather-flutter/get_weather",
  flutterBin,
});
console.log("✓ Flutter component built");

const getWeather = defineTool({
  name: "get_weather",
  description: "Current weather and a short hourly forecast for a city.",
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({
    tempC: z.number(),
    condition: z.string(),
    hourly: z.array(z.object({ hour: z.number(), tempC: z.number() })),
  }),
  ui: weatherCard,
  handler: ({ city }) => {
    const base = (city.length * 3) % 28;
    return {
      tempC: base + 6,
      condition: base > 14 ? "Sunny" : "Cloudy",
      hourly: Array.from({ length: 6 }, (_, i) => ({
        hour: 9 + i * 2,
        tempC: base + 6 + ((i % 3) - 1) * 2,
      })),
    };
  },
});

const app = defineApp({
  name: "weather-flutter",
  version: "1.0.0",
  renderer: "flutter",
  tools: [getWeather],
});

const port = Number(process.env.PORT ?? 5189);
const emulator = await serveEmulator(app, { port });
console.log(`\n  ▸ emulator   ${emulator.url}`);
console.log(`  ▸ mcp        ${emulator.url}/mcp\n`);

if (process.argv.includes("--tunnel")) {
  try {
    const tunnel = await startCloudflareTunnel({ port });
    console.log(`  ▸ public     ${tunnel.url}\n`);
  } catch (err) {
    console.error(`  ✗ tunnel failed: ${(err as Error).message}\n`);
  }
}
