import { mountMcp } from "@mcpapps/server/hono";
import { Hono } from "hono";
import { app } from "./app.js";

// Cloudflare Workers entry. The same Hono app, no Node APIs — `wrangler deploy`.
const hono = new Hono();
mountMcp(hono, app);

export default hono;
