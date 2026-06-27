import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeComponentsModule } from "@mcpapps/vite-plugin-vue";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

await writeComponentsModule(
  [
    {
      name: "weatherCard",
      entry: resolve(root, "src/components/WeatherCard.vue"),
      uri: "ui://weather-app/get_weather",
      title: "Weather",
    },
  ],
  resolve(root, "src/generated/components.ts"),
  { root },
);

console.log("✓ compiled Vue components → src/generated/components.ts");
