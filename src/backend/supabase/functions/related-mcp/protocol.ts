// JSON-RPC helpers for MCP Streamable HTTP.
//
// deno-lint-ignore-file no-explicit-any

import { MCP_CORS_HEADERS } from "./auth.ts";

export const MCP_PROTOCOL_VERSION = "2024-11-05";

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export function jsonRpcResult(
  id: string | number | null,
  result: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, data },
  };
}

export function httpJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...MCP_CORS_HEADERS,
      "content-type": "application/json",
    },
  });
}

export function toolResultContent(value: unknown, isError = false) {
  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
    isError,
  };
}

export function initializeResult() {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "related-mcp", version: "1.0.0" },
  };
}

export function normalizeTools(tools: ReadonlyArray<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}>) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.input_schema,
  }));
}

export async function parseJsonRpcBody(req: Request): Promise<JsonRpcRequest[]> {
  const raw = await req.text();
  if (!raw.trim()) return [];
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed as JsonRpcRequest[];
  return [parsed as JsonRpcRequest];
}

export function isNotification(message: JsonRpcRequest): boolean {
  return message.id === undefined || message.id === null;
}
