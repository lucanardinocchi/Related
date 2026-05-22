// chat-respond Edge Function — Conversational Intelligence backend per
// ADR-0009. Wraps the Anthropic Sonnet-class model server-side so the API
// key never reaches the client bundle. Receives a chatId, loads the
// transcript through the User's authenticated Supabase client (RLS
// enforces ownership), preloads a compact ConversationContextSnapshot
// of the User's world, runs a multi-round tool-use loop with the
// read-only tool surface, then persists the final assistant turn and
// returns it.
//
// **Read-only by design.** None of the tools mutate state. Every effect
// on the world still passes through a Candidate Action surfaced by
// Ambient Intelligence — see ADR-0009.
//
// This file is the glue layer. Behaviour is split across:
//   - contextLoader.ts — single-call snapshot of the User's world
//   - @related/shared/conversational — prompt, tools, agent loop
//   - tools.ts         — Supabase-backed tool dispatcher
//   - types.ts         — chat-respond-specific interfaces
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy chat-respond
//
// Runtime: Deno (Supabase Edge Runtime).
//
// deno-lint-ignore-file no-explicit-any

import Anthropic from "npm:@anthropic-ai/sdk@^0.96.0";
import { createClient } from "npm:@supabase/supabase-js@^2.45.0";

import {
  buildConversationalHistoryMessages,
  encodeSseEvent,
  renderContextBlock,
  runConversationalToolLoop,
} from "../../../../shared/src/conversational/index.ts";
import type { AnthropicStreamingClient } from "../../../../shared/src/conversational/agentLoop.ts";
import { loadConversationContext } from "./contextLoader.ts";
import { dispatchTool } from "./tools.ts";
import type { ChatMessageRow, ToolCallSummary, ToolContext } from "./types.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

if (!ANTHROPIC_API_KEY) {
  console.warn("ANTHROPIC_API_KEY not set — chat-respond will fail at request time.");
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "SUPABASE_URL / SUPABASE_ANON_KEY not set in chat-respond env — Supabase Edge Runtime should inject these automatically.",
  );
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

async function streamToolLoop(
  anthropic: Anthropic,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  contextBlock: string,
  ctx: ToolContext,
  emit: (event: string, data: unknown) => void,
): Promise<{ text: string; toolCalls: ToolCallSummary[] }> {
  return runConversationalToolLoop({
    client: anthropic as unknown as AnthropicStreamingClient,
    history,
    contextBlock,
    dispatchTool: (name, input) => dispatchTool(name, input, ctx),
    callbacks: {
      onTextDelta: (delta) => emit("text_delta", { delta }),
      onToolUse: (tool) => emit("tool_use", tool),
      onToolResult: (result) => emit("tool_result", result),
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonError(405, "method not allowed");
  }
  if (!ANTHROPIC_API_KEY) {
    return jsonError(500, "ANTHROPIC_API_KEY not configured");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonError(401, "missing Authorization header");
  }

  let body: { chatId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid JSON body");
  }
  if (!body.chatId || typeof body.chatId !== "string") {
    return jsonError(400, "missing chatId");
  }

  const supabase = createClient(SUPABASE_URL ?? "", SUPABASE_ANON_KEY ?? "", {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const chatRes = await supabase
    .from("chats")
    .select("id, closed_at")
    .eq("id", body.chatId)
    .single();
  if (chatRes.error) {
    return jsonError(404, `chat not found: ${chatRes.error.message}`);
  }
  if (chatRes.data?.closed_at) {
    return jsonError(409, "chat is closed; cannot generate new turns");
  }

  const msgRes = await supabase
    .from("chat_messages")
    .select("id, role, content, tool_calls, tool_call_id, created_at")
    .eq("chat_id", body.chatId)
    .order("created_at", { ascending: true });
  if (msgRes.error) {
    return jsonError(500, `failed to load messages: ${msgRes.error.message}`);
  }

  const rows = (msgRes.data ?? []) as ChatMessageRow[];
  if (rows.length === 0) {
    return jsonError(400, "chat has no messages — cannot respond to nothing");
  }
  const last = rows[rows.length - 1];
  if (last.role !== "user") {
    return jsonError(
      409,
      "last message is not from the user; nothing to respond to",
    );
  }

  const history = buildConversationalHistoryMessages(rows);

  let contextBlock: string;
  try {
    const snapshot = await loadConversationContext(supabase);
    contextBlock = renderContextBlock(snapshot);
  } catch (err) {
    console.warn(
      "chat-respond: context preload failed, continuing with empty snapshot:",
      err,
    );
    contextBlock =
      "<user_world>\n(context preload failed; rely on tools)\n</user_world>";
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        try {
          controller.enqueue(encodeSseEvent(event, data));
        } catch {
          // Controller closed (client disconnected) — swallow.
        }
      };

      let result: { text: string; toolCalls: ToolCallSummary[] };
      try {
        result = await streamToolLoop(
          anthropic,
          history,
          contextBlock,
          { supabase },
          emit,
        );
      } catch (err) {
        emit("error", {
          message: err instanceof Error ? err.message : String(err),
        });
        controller.close();
        return;
      }

      const insertRes = await supabase
        .from("chat_messages")
        .insert({
          chat_id: body.chatId,
          role: "assistant",
          content: result.text || "(empty reply)",
          tool_calls: result.toolCalls.length ? result.toolCalls : null,
        })
        .select(
          "id, chat_id, role, content, tool_calls, tool_call_id, created_at",
        )
        .single();
      if (insertRes.error) {
        emit("error", {
          message: `failed to persist assistant message: ${insertRes.error.message}`,
        });
        controller.close();
        return;
      }

      emit("done", { message: insertRes.data });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
});
