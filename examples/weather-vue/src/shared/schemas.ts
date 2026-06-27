import { z } from "zod";

/** Single source of truth for the get_weather tool's input/output. */
export const getWeatherInput = z.object({
  city: z.string().describe("City name, e.g. London"),
});

export const getWeatherOutput = z.object({
  tempC: z.number(),
  condition: z.string(),
  hourly: z.array(z.object({ hour: z.number(), tempC: z.number() })),
});

/** The typed registry used to augment @mcpapps/vue's ToolRegistry. */
export type ToolMap = {
  get_weather: {
    input: z.infer<typeof getWeatherInput>;
    output: z.infer<typeof getWeatherOutput>;
  };
};
