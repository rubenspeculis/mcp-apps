import { createInterface } from "node:readline";
import type { JsonRpcMessage } from "@mcpapps/protocol";
import type { McpApp } from "./define.js";
import { processMessage } from "./mcp-handler.js";

export interface ServeStdioOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

export interface StdioServer {
  close: () => void;
}

/**
 * Serve the app over the MCP stdio transport: newline-delimited JSON-RPC on
 * stdin/stdout. This is how desktop hosts (e.g. Claude Desktop) that spawn a
 * server subprocess talk to it. Node-only.
 */
export function serveStdio(app: McpApp, options: ServeStdioOptions = {}): StdioServer {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const rl = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(trimmed) as JsonRpcMessage;
    } catch {
      return; // ignore malformed lines
    }
    void processMessage(app, message).then((response) => {
      if (response) output.write(`${JSON.stringify(response)}\n`);
    });
  });

  return { close: () => rl.close() };
}
