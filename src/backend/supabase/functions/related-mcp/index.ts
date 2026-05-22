// related-mcp Edge Function — Related MCP server over Streamable HTTP.
// Authenticates MCP clients via rk_* API keys from Settings → Connect MCP.
//
// Deploy:
//   supabase functions deploy related-mcp --no-verify-jwt
//
// deno-lint-ignore-file no-explicit-any

import { MCP_TOOLS } from "../../../../shared/src/mcp/mcpTools.ts";
import {
  createAdminClient,
  MCP_CORS_HEADERS,
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  verifyMcpApiKey,
} from "./auth.ts";
import { dispatchMcpTool } from "./dispatch.ts";
import {
  httpJson,
  initializeResult,
  isNotification,
  jsonRpcError,
  jsonRpcResult,
  normalizeTools,
  parseJsonRpcBody,
  toolResultContent,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "./protocol.ts";

async function handleRequest(
  message: JsonRpcRequest,
  ownerId: string,
  adminClient: any,
): Promise<JsonRpcResponse | null> {
  const id = message.id ?? null;
  const method = message.method ?? "";
  const params = (message.params ?? {}) as Record<string, unknown>;

  if (isNotification(message)) {
    if (method === "notifications/initialized") return null;
    return null;
  }

  switch (method) {
    case "initialize":
      return jsonRpcResult(id, initializeResult());

    case "ping":
      return jsonRpcResult(id, {});

    case "tools/list":
      return jsonRpcResult(id, { tools: normalizeTools(MCP_TOOLS as any) });

    case "tools/call": {
      const toolName = params.name as string;
      const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;
      if (!toolName) {
        return jsonRpcError(id, -32602, "tools/call requires params.name");
      }
      try {
        const result = await dispatchMcpTool(toolName, toolArgs, {
          supabase: adminClient,
          ownerId,
        });
        return jsonRpcResult(id, toolResultContent(result, false));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return jsonRpcResult(id, toolResultContent({ error: msg }, true));
      }
    }

    default:
      return jsonRpcError(id, -32601, `Method not found: ${method}`);
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: MCP_CORS_HEADERS });
  }

  if (req.method === "GET") {
    return httpJson({
      name: "related-mcp",
      transport: "streamable-http",
      message: "POST JSON-RPC requests with Authorization: Bearer rk_…",
    });
  }

  if (req.method !== "POST") {
    return httpJson(jsonRpcError(null, -32600, "method not allowed"), 405);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return httpJson(
      jsonRpcError(null, -32603, "server misconfigured: missing Supabase env"),
      500,
    );
  }

  const adminClient = createAdminClient();
  const verified = await verifyMcpApiKey(
    req.headers.get("Authorization"),
    adminClient,
  );
  if (!verified) {
    return httpJson(jsonRpcError(null, -32001, "invalid MCP API key"), 401);
  }

  let messages: JsonRpcRequest[];
  try {
    messages = await parseJsonRpcBody(req);
  } catch {
    return httpJson(jsonRpcError(null, -32700, "Parse error"), 400);
  }

  if (messages.length === 0) {
    return httpJson(jsonRpcError(null, -32600, "Invalid Request"), 400);
  }

  const responses: JsonRpcResponse[] = [];
  for (const message of messages) {
    if (message.jsonrpc && message.jsonrpc !== "2.0") {
      responses.push(jsonRpcError(message.id ?? null, -32600, "Invalid Request"));
      continue;
    }
    const response = await handleRequest(message, verified.ownerId, adminClient);
    if (response) responses.push(response);
  }

  if (responses.length === 1) {
    return httpJson(responses[0]);
  }
  return httpJson(responses);
}

if (import.meta.main) {
  Deno.serve(handler);
}
