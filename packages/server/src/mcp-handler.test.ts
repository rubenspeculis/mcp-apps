import { MCP_APP_MIME } from "@mcpapps/protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineApp, defineTool } from "./define.js";
import { createMcpHandler, type FetchHandler } from "./mcp-handler.js";

const weather = defineTool({
  name: "get_weather",
  description: "Current weather for a city",
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ tempC: z.number(), condition: z.string() }),
  ui: {
    uri: "ui://weather/get_weather",
    html: "<h1>weather</h1>",
    csp: {
      connectDomains: ["https://api.example.com"],
      resourceDomains: ["https://cdn.example.com"],
    },
    permissions: { clipboardWrite: {} },
    prefersBorder: true,
  },
  handler: ({ city }) => ({ tempC: city === "London" ? 12 : 25, condition: "Sunny" }),
});

const app = defineApp({
  name: "weather-app",
  version: "1.0.0",
  renderer: "vue",
  compat: true,
  tools: [weather],
});

function rpc(handler: FetchHandler, body: unknown): Promise<Response> {
  return handler(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("createMcpHandler", () => {
  const handler = createMcpHandler(app);

  it("responds to initialize with server info and capabilities", async () => {
    const res = await rpc(handler, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    });
    const body = await res.json();
    expect(body.result.serverInfo).toEqual({ name: "weather-app", version: "1.0.0" });
    expect(body.result.capabilities).toHaveProperty("tools");
    expect(body.result.capabilities).toHaveProperty("resources");
  });

  it("lists tools with JSON schema and the ui _meta binding", async () => {
    const res = await rpc(handler, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const body = await res.json();
    const tool = body.result.tools[0];
    expect(tool.name).toBe("get_weather");
    expect(tool.inputSchema.type).toBe("object");
    expect(tool.inputSchema.properties.city.type).toBe("string");
    expect(tool._meta.ui.resourceUri).toBe("ui://weather/get_weather");
    // CSP / permissions surfaced under _meta.ui
    expect(tool._meta.ui.csp.connectDomains).toEqual(["https://api.example.com"]);
    expect(tool._meta.ui.permissions).toEqual({ clipboardWrite: {} });
    expect(tool._meta.ui.prefersBorder).toBe(true);
    // compat mirror keys present
    expect(tool._meta["openai/outputTemplate"]).toBe("ui://weather/get_weather");
    expect(tool._meta["openai/widgetCSP"].connect_domains).toEqual(["https://api.example.com"]);
    expect(tool._meta["openai/widgetCSP"].resource_domains).toEqual(["https://cdn.example.com"]);
  });

  it("lists resources with the ui _meta block", async () => {
    const res = await rpc(handler, { jsonrpc: "2.0", id: 7, method: "resources/list" });
    const body = await res.json();
    const resource = body.result.resources[0];
    expect(resource.uri).toBe("ui://weather/get_weather");
    expect(resource._meta.ui.resourceUri).toBe("ui://weather/get_weather");
    expect(resource._meta.ui.csp.connectDomains).toEqual(["https://api.example.com"]);
  });

  it("calls a tool and returns structuredContent + ui meta", async () => {
    const res = await rpc(handler, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_weather", arguments: { city: "London" } },
    });
    const body = await res.json();
    expect(body.result.structuredContent).toEqual({ tempC: 12, condition: "Sunny" });
    expect(body.result._meta.ui.resourceUri).toBe("ui://weather/get_weather");
  });

  it("returns isError for invalid tool arguments", async () => {
    const res = await rpc(handler, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "get_weather", arguments: { city: 123 } },
    });
    const body = await res.json();
    expect(body.result.isError).toBe(true);
  });

  it("reads a ui:// resource as MCP-app HTML", async () => {
    const res = await rpc(handler, {
      jsonrpc: "2.0",
      id: 5,
      method: "resources/read",
      params: { uri: "ui://weather/get_weather" },
    });
    const body = await res.json();
    expect(body.result.contents[0].mimeType).toBe(MCP_APP_MIME);
    expect(body.result.contents[0].text).toContain("weather");
    // CSP travels on the resource content's _meta.ui (spec) + compat key.
    expect(body.result.contents[0]._meta.ui.csp.connectDomains).toEqual([
      "https://api.example.com",
    ]);
    expect(body.result.contents[0]._meta["openai/widgetCSP"].connect_domains).toEqual([
      "https://api.example.com",
    ]);
  });

  it("errors on an unknown method", async () => {
    const res = await rpc(handler, { jsonrpc: "2.0", id: 6, method: "does/not/exist" });
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });

  it("returns 202 for a notification (no id)", async () => {
    const res = await rpc(handler, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
  });
});
