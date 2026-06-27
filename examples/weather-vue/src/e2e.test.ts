import { MCP_APP_MIME } from "@mcpapps/protocol";
import { createMcpHandler } from "@mcpapps/server";
import { describe, expect, it } from "vitest";
import { app } from "./app.js";

const handler = createMcpHandler(app);

async function rpc(method: string, params?: unknown) {
  const res = await handler(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  return res.json();
}

describe("weather-vue end to end", () => {
  it("lists get_weather bound to its ui resource", async () => {
    const body = await rpc("tools/list");
    const tool = body.result.tools.find((t: { name: string }) => t.name === "get_weather");
    expect(tool._meta.ui.resourceUri).toBe("ui://weather-app/get_weather");
  });

  it("calls get_weather and validates the structured output", async () => {
    const body = await rpc("tools/call", {
      name: "get_weather",
      arguments: { city: "London" },
    });
    const out = body.result.structuredContent;
    expect(typeof out.tempC).toBe("number");
    expect(out.hourly).toHaveLength(6);
  });

  it("serves the compiled Vue component as self-contained MCP-app HTML", async () => {
    const body = await rpc("resources/read", { uri: "ui://weather-app/get_weather" });
    const resource = body.result.contents[0];
    expect(resource.mimeType).toBe(MCP_APP_MIME);
    // The Vue runtime + client-core bridge are inlined into the HTML.
    expect(resource.text).toContain('<div id="root">');
    expect(resource.text).toContain("<script>");
    expect(resource.text.length).toBeGreaterThan(10_000); // bundle is really inlined
  });
});
