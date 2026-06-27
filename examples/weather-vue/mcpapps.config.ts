import { defineConfig } from "@mcpapps/cli";

export default defineConfig({
  renderer: "vue",
  app: "./src/app.ts",
  generated: "./src/generated/components.ts",
  components: [
    {
      name: "weatherCard",
      entry: "./src/components/WeatherCard.vue",
      uri: "ui://weather-app/get_weather",
      title: "Weather",
    },
  ],
  port: 5179,
});
