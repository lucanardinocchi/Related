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
//   - prompt.ts        — static directive prompt + per-turn context block
//   - tools.ts         — read-only tool defs and dispatcher
//   - types.ts         — shared interfaces
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

import { loadConversationContext } from "./contextLoader.ts";
import { renderContextBlock, SYSTEM_PROMPT_BASE } from "./prompt.ts";
import { dispatchTool, TOOLS } from "./tools.ts";
import type {
  ChatMessageRow,
  ToolCallSummary,
  ToolContext,
} from "./types.ts";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;
const MAX_TOOL_ROUNDS = 8;

// =============================================================================
// Message conversion — chat_messages rows ↔ Anthropic content blocks.
// =============================================================================

/**
 * Build the Anthropic message array from stored chat history.
 *
 * Per ADR-0009: stored assistant turns capture the *final* text plus
 * tool_calls metadata for UI rendering. The intermediate tool_use /
 * tool_result rounds are ephemeral within a single chat-respond
 * invocation. So when re-sending to Claude across turns, we send only
 * text — never the prior tool_calls — which avoids Anthropic's
 * "tool_use must be followed by tool_result" constraint and keeps
 * inter-turn context simple.
 */
function buildHistoryMessages(rows: ChatMessageRow[]): Array<{
  role: "user" | "assistant";
  content: string;
}> {
  return rows
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content,
    }));
}

// =============================================================================
// Anthropic tool-use loop with SSE streaming.
// =============================================================================

/**
 * Encodes a single SSE event into the wire format the
 * `parseSseStream` parser in @related/shared expects:
 *
 *   event: <name>\ndata: <json>\n\n
 *
 * `data` is a JSON-stringified object (always single-line — multi-line
 * `data:` would need re-joining, so we keep it flat).
 */
function sseEvent(event: string, data: unknown): Uint8Array {
  const payload = JSON.stringify(data ?? {});
  return new TextEncoder().encode(`event: ${event}\ndata: ${payload}\n\n`);
}

/**
 * Run the tool-use loop with token streaming. `emit` writes SSE events
 * to the response body as the agent emits content. Returns the final
 * text + accumulated tool-call summaries; the caller persists them to
 * `chat_messages` and emits the `done` event.
 *
 * The system prompt is sent as two blocks:
 *   1. SYSTEM_PROMPT_BASE with `cache_control: ephemeral` so subsequent
 *      turns in the same chat hit the cache and skip re-tokenising it.
 *   2. The per-turn context block (User's world snapshot). Not cached
 *      because Open Threads / Interactions can change between turns.
 */
async function streamToolLoop(
  anthropic: Anthropic,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  contextBlock: string,
  ctx: ToolContext,
  emit: (event: string, data: unknown) => void,
): Promise<{ text: string; toolCalls: ToolCallSummary[] }> {
  const toolCalls: ToolCallSummary[] = [];

  const systemBlocks = [
    {
      type: "text",
      text: SYSTEM_PROMPT_BASE,
      cache_control: { type: "ephemeral" },
    },
    { type: "text", text: contextBlock },
  ];

  const working: Array<{
    role: "user" | "assistant";
    content: string | unknown[];
  }> = history.map((m) => ({ role: m.role, content: m.content }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemBlocks as any,
      tools: TOOLS as any,
      messages: working as any,
    });

    // Emit text deltas as they arrive. The Anthropic SDK exposes a
    // `messageStream.on('text', ...)` event; we await the final
    // message after the stream resolves.
    stream.on("text", (textDelta: string) => {
      if (textDelta) emit("text_delta", { delta: textDelta });
    });

    const finalMessage = await stream.finalMessage();
    const blocks = (finalMessage.content ?? []) as Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;

    const toolUses = blocks.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) {
      const text = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n")
        .trim();
      return { text, toolCalls };
    }

    // Emit a tool_use SSE event for each tool the model called this
    // round, so the UI can render the chip immediately. Then persist
    // the assistant turn as structured content so subsequent
    // tool_result messages bind to the right tool_use_ids.
    for (const tu of toolUses) {
      emit("tool_use", {
        id: tu.id ?? "",
        name: tu.name ?? "",
        input: tu.input ?? {},
      });
    }
    working.push({ role: "assistant", content: blocks });

    // Dispatch tools in parallel.
    const results = await Promise.all(
      toolUses.map(async (tu) => {
        try {
          const result = await dispatchTool(
            tu.name ?? "",
            (tu.input ?? {}) as Record<string, unknown>,
            ctx,
          );
          const json = JSON.stringify(result);
          const preview =
            json.length > 4000 ? json.slice(0, 4000) + "…" : json;
          toolCalls.push({
            id: tu.id ?? "",
            name: tu.name ?? "",
            input: tu.input ?? {},
            result_preview: preview,
          });
          emit("tool_result", { id: tu.id ?? "", preview });
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: json,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          toolCalls.push({
            id: tu.id ?? "",
            name: tu.name ?? "",
            input: tu.input ?? {},
            result_preview: "",
            error: message,
          });
          emit("tool_result", {
            id: tu.id ?? "",
            preview: "",
            error: message,
          });
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Error: ${message}`,
            is_error: true,
          };
        }
      }),
    );

    working.push({ role: "user", content: results });
  }

  return {
    text: "(I tried to gather data but exceeded the tool-use round limit. Could you narrow what you'd like me to look at?)",
    toolCalls,
  };
}

// =============================================================================
// Request handler.
// =============================================================================

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
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

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

  const history = buildHistoryMessages(rows);

  // Preload the User's world before invoking the model. One round of
  // queries gathered concurrently — see contextLoader.ts. If the load
  // fails (table missing, RLS unhappy), degrade gracefully rather than
  // failing the whole chat turn.
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

  // SSE response body. We hold a controller for the ReadableStream so
  // streamToolLoop's `emit` callback can write events as soon as they
  // arrive from Anthropic.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        try {
          controller.enqueue(sseEvent(event, data));
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
