import { defineApp, defineTool } from "@mcpapps/server";
import { mountMcp } from "@mcpapps/server/hono";
import { Hono } from "hono";
import { z } from "zod";
import { COMPONENT_BASE_PATH, COMPONENT_HTML, COMPONENT_URI } from "./generated/component-meta.js";

const outputSchema = z.object({
  tempC: z.number(),
  condition: z.string(),
  hourly: z.array(z.object({ hour: z.number().int(), tempC: z.number() })),
});

const getWeather = defineTool({
  name: "get_weather",
  description: "Current weather and a short hourly forecast for a city.",
  inputSchema: z.object({ city: z.string() }),
  outputSchema,
  ui: { uri: COMPONENT_URI, html: COMPONENT_HTML, basePath: COMPONENT_BASE_PATH },
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

const hono = new Hono();
mountMcp(hono, app);
export default hono;
