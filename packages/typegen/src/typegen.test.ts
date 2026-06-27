import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodToDart } from "./index.js";

describe("zodToDart", () => {
  it("generates a class with primitive fields and correct fromJson casts", () => {
    const dart = zodToDart([
      { name: "Greeting", schema: z.object({ greeting: z.string(), count: z.number().int() }) },
    ]);
    expect(dart).toContain("class Greeting {");
    expect(dart).toContain("final String greeting;");
    expect(dart).toContain("final int count;");
    expect(dart).toContain("greeting: j['greeting'] as String,");
    expect(dart).toContain("count: (j['count'] as num).toInt(),");
  });

  it("generates nested classes for objects and lists of objects", () => {
    const dart = zodToDart([
      {
        name: "GetWeatherOutput",
        schema: z.object({
          tempC: z.number(),
          condition: z.string(),
          hourly: z.array(z.object({ hour: z.number().int(), tempC: z.number() })),
        }),
      },
    ]);
    expect(dart).toContain("class GetWeatherOutput {");
    expect(dart).toContain("final double tempC;");
    expect(dart).toContain("final List<GetWeatherOutputHourlyItem> hourly;");
    // nested item class
    expect(dart).toContain("class GetWeatherOutputHourlyItem {");
    expect(dart).toContain(
      "hourly: (j['hourly'] as List).map((e) => GetWeatherOutputHourlyItem.fromJson(e as Map<String, dynamic>)).toList(),",
    );
    // toJson serializes nested objects
    expect(dart).toContain("'hourly': hourly.map((e) => e.toJson()).toList(),");
  });

  it("marks non-required fields nullable", () => {
    const dart = zodToDart([
      { name: "Opt", schema: z.object({ a: z.string(), b: z.string().optional() }) },
    ]);
    expect(dart).toContain("final String a;");
    expect(dart).toContain("final String? b;");
    expect(dart).toContain("b: j['b'] == null ? null : j['b'] as String,");
  });
});
