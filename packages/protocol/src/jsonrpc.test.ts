import { describe, expect, it } from "vitest";
import {
  isJsonRpcError,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
  type JsonRpcMessage,
} from "./jsonrpc.js";

describe("json-rpc guards", () => {
  const request: JsonRpcMessage = { jsonrpc: "2.0", id: 1, method: "tools/call" };
  const notification: JsonRpcMessage = { jsonrpc: "2.0", method: "ui/ready" };
  const success: JsonRpcMessage = { jsonrpc: "2.0", id: 1, result: { ok: true } };
  const error: JsonRpcMessage = {
    jsonrpc: "2.0",
    id: 1,
    error: { code: -32603, message: "boom" },
  };

  it("classifies a request", () => {
    expect(isJsonRpcRequest(request)).toBe(true);
    expect(isJsonRpcNotification(request)).toBe(false);
    expect(isJsonRpcResponse(request)).toBe(false);
  });

  it("classifies a notification", () => {
    expect(isJsonRpcNotification(notification)).toBe(true);
    expect(isJsonRpcRequest(notification)).toBe(false);
  });

  it("classifies a success response", () => {
    expect(isJsonRpcResponse(success)).toBe(true);
    expect(isJsonRpcError(success)).toBe(false);
  });

  it("classifies an error response", () => {
    expect(isJsonRpcResponse(error)).toBe(true);
    expect(isJsonRpcError(error)).toBe(true);
  });
});
