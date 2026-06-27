import { serve } from "@hono/node-server";
import { mountMcp } from "@mcpapps/server/hono";
import { Hono } from "hono";
import { app } from "./app.js";

const hono = new Hono();
mountMcp(hono, app);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: hono.fetch, port }, (info) => {
  console.log(`MCP server (Node) listening on http://localhost:${info.port}/mcp`);
});
