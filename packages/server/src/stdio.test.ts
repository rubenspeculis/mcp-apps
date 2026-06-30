import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineApp, defineTool } from "./define.js";
import { serveStdio } from "./stdio.js";

const app = defineApp({
  name: "echo-app",
  version: "1.0.0",
  renderer: "vue",
  tools: [
    defineTool({
      name: "echo",
      inputSchema: z.object({ text: z.string() }),
      outputSchema: z.object({ text: z.string() }),
      handler: ({ text }) => ({ text }),
    }),
  ],
});

function nextLine(stream: PassThrough): Promise<string> {
  return new Promise((resolve) => {
    stream.once("data", (chunk: Buffer) => resolve(chunk.toString().trim()));
  });
}

describe("serveStdio", () => {
  it("answers a JSON-RPC request over newline-delimited stdio", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    serveStdio(app, { input, output });

    const line = nextLine(output);
    input.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "echo", arguments: { text: "hi" } } })}\n`,
    );

    const response = JSON.parse(await line);
    expect(response.id).toBe(1);
    expect(response.result.structuredContent).toEqual({ text: "hi" });
  });

  it("reports malformed JSON through an opt-in diagnostics hook", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const onMalformedJson = vi.fn();
    serveStdio(app, { input, output, onMalformedJson });

    let wrote = false;
    output.on("data", () => {
      wrote = true;
    });
    input.write("{broken json\n");
    await new Promise((r) => setTimeout(r, 20));

    expect(wrote).toBe(false);
    expect(onMalformedJson).toHaveBeenCalledWith("{broken json", expect.any(SyntaxError));
  });

  it("writes nothing for a notification", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    serveStdio(app, { input, output });

    let wrote = false;
    output.on("data", () => {
      wrote = true;
    });
    input.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    await new Promise((r) => setTimeout(r, 20));
    expect(wrote).toBe(false);
  });
});
