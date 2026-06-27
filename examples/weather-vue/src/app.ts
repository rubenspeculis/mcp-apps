import { defineApp, defineTool } from "@mcpapps/server";
import { weatherCard } from "./generated/components.js";
import { getWeatherInput, getWeatherOutput } from "./shared/schemas.js";

const getWeather = defineTool({
  name: "get_weather",
  description: "Current weather and a short hourly forecast for a city.",
  inputSchema: getWeatherInput,
  outputSchema: getWeatherOutput,
  ui: weatherCard,
  handler: ({ city }) => {
    // Deterministic pseudo-weather so the demo is reproducible.
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

export const app = defineApp({
  name: "weather-app",
  version: "1.0.0",
  renderer: "vue",
  compat: true,
  tools: [getWeather],
});
