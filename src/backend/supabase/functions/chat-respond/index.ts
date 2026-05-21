// chat-respond Edge Function — Conversational Intelligence backend per
// ADR-0009. Wraps the Anthropic Sonnet-class model server-side so the API
// key never reaches the client bundle. Receives a chatId, loads the
// transcript through the User's authenticated Supabase client (RLS
// enforces ownership), runs a multi-round tool-use loop with the
// read-only tool surface defined below, then persists the final
// assistant turn and returns it.
//
// **Read-only by design.** None of the tools mutate state. Every effect
// on the world still passes through a Candidate Action surfaced by
// Ambient Intelligence — see ADR-0009.
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy chat-respond
//
// Runtime: Deno (Supabase Edge Runtime).
//
// deno-lint-ignore-file no-explicit-any

import Anthropic from "npm:@anthropic-ai/sdk@^0.96.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;
const MAX_TOOL_ROUNDS = 8;

const SYSTEM_PROMPT = `You are Conversational Intelligence for Related — a relationship-intelligence app.

Your role:
- You are READ-ONLY on app state. You can read Relationships, Contacts, Open Threads, Interactions, Calendar events, Groups, and the User's User Context (Goals & Values, Situational State, Transient Intent, Inferred Signals). You CANNOT create, update, or delete anything. Mutations are the job of a separate Ambient Intelligence agent that proposes Candidate Actions for the User to accept.
- You ask questions to elicit context. The User's self-narrative content (life situation, current mental state, what they're trying to do this week) is what you exist to draw out. After this Chat closes, an Extraction Pass will route what they said into Situational State and Transient Intent — you do not write those yourself.
- Be concrete. Use the tools to ground your answers in the User's actual data. Do not speculate when you can look up.
- Be brief. Conversational, not encyclopaedic. Ask follow-up questions rather than dumping information.
- Never propose specific actions ("you should text Sam"). Reflect, ask, surface — don't prescribe. Prescriptions are Ambient Intelligence's job, surfaced as Candidate Actions on the User's Relationships.
- Never speak first on a new Chat — but you are mid-Chat now, so respond directly to the latest User message.

Tool use:
- Call tools whenever a question touches concrete data. Don't ask the User something the tools could answer.
- Tool results are JSON. Synthesise — don't paste raw JSON back at the User.
- Multiple tool calls per turn are fine. Plan them and dispatch in parallel when independent.

Output: a single concise reply addressed to the User. Plain text only — no Markdown headings, no bullet lists unless the User explicitly asked for a list.`;

// =============================================================================
// Tool surface — read-only. Per ADR-0009 Q7.
// =============================================================================

const TOOLS = [
  {
    name: "list_relationships",
    description:
      "List all of the User's Relationships (the bond from User to a Contact or Group). Returns id, role, cadence, and the target Contact or Group's name + basic details. Use to enumerate the people in their world.",
    input_schema: {
      type: "object",
      properties: {
        target_type: {
          type: "string",
          enum: ["contact", "group", "all"],
          description: "Filter to Contact-targeted, Group-targeted, or all (default).",
        },
      },
    },
  },
  {
    name: "get_relationship",
    description:
      "Get one Relationship by id with the full Contact (or Group) profile attached.",
    input_schema: {
      type: "object",
      required: ["relationship_id"],
      properties: { relationship_id: { type: "string" } },
    },
  },
  {
    name: "list_contacts",
    description:
      "List all Contacts the User has stored. A Contact is a referenced person, not a Relationship — use list_relationships when you want bond context.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_contact",
    description: "Get a single Contact by id with full profile fields.",
    input_schema: {
      type: "object",
      required: ["contact_id"],
      properties: { contact_id: { type: "string" } },
    },
  },
  {
    name: "list_open_threads",
    description:
      "List the User's Open Threads (commitments, owed replies, unresolved items). Optionally filter to threads attached to a specific Relationship, or to me_owes_them direction (Commitments view).",
    input_schema: {
      type: "object",
      properties: {
        relationship_id: { type: "string" },
        direction: {
          type: "string",
          enum: ["me_owes_them", "they_owe_me"],
        },
        include_closed: {
          type: "boolean",
          description: "Include closed threads (default false).",
        },
      },
    },
  },
  {
    name: "list_interactions",
    description:
      "List Interactions (logged or planned moments of contact). Optionally filter by contact, status, or time window.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        status: {
          type: "string",
          enum: ["planned", "occurred", "missed"],
        },
        since: { type: "string", description: "ISO timestamp lower bound." },
        until: { type: "string", description: "ISO timestamp upper bound." },
      },
    },
  },
  {
    name: "list_calendar_events",
    description:
      "List external Google Calendar events the agent has synced into inferred_signal_calendar. Read-only mirror; this is the Calendar density signal.",
    input_schema: {
      type: "object",
      properties: {
        since: { type: "string" },
        until: { type: "string" },
      },
    },
  },
  {
    name: "list_groups",
    description: "List the User's Groups (named collections of Contacts).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_group",
    description: "Get a Group by id with member Contacts attached.",
    input_schema: {
      type: "object",
      required: ["group_id"],
      properties: { group_id: { type: "string" } },
    },
  },
  {
    name: "get_user_context",
    description:
      "Get the User's User Context — all four flavours: Goals & Values (User-authored), Situational State (current life context), recent Transient Intent (recent ephemeral intents from prior Chats), and Inferred Signals (Calendar density + Sleep summary, if present).",
    input_schema: { type: "object", properties: {} },
  },
] as const;

// =============================================================================
// Tool dispatchers — read directly via the User-scoped Supabase client.
// RLS enforces owner-only.
// =============================================================================

interface ToolContext {
  supabase: SupabaseClient;
}

async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (name) {
    case "list_relationships": {
      const targetType = input.target_type as string | undefined;
      let q = ctx.supabase
        .from("relationships")
        .select(
          "id, target_type, role, cadence, created_at, contact:contacts!target_contact_id(id, name, phone, email, birthday, area, occupation, education), group_target:groups!target_group_id(id, name)",
        )
        .order("created_at", { ascending: false });
      if (targetType && targetType !== "all") q = q.eq("target_type", targetType);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    }
    case "get_relationship": {
      const { data, error } = await ctx.supabase
        .from("relationships")
        .select(
          "id, target_type, role, cadence, created_at, contact:contacts!target_contact_id(id, name, phone, email, birthday, area, occupation, education), group_target:groups!target_group_id(id, name)",
        )
        .eq("id", input.relationship_id as string)
        .single();
      if (error) throw error;
      return data;
    }
    case "list_contacts": {
      const { data, error } = await ctx.supabase
        .from("contacts")
        .select(
          "id, name, phone, email, birthday, area, occupation, education, created_at",
        )
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    }
    case "get_contact": {
      const { data, error } = await ctx.supabase
        .from("contacts")
        .select(
          "id, name, phone, email, birthday, area, occupation, education, created_at",
        )
        .eq("id", input.contact_id as string)
        .single();
      if (error) throw error;
      return data;
    }
    case "list_open_threads": {
      const includeClosed = !!input.include_closed;
      const direction = input.direction as string | undefined;
      const relationshipId = input.relationship_id as string | undefined;

      let q = ctx.supabase
        .from("open_threads")
        .select(
          "id, description, direction, origin, communication_status, created_at, closed_at, open_thread_relationships(relationship_id)",
        )
        .order("created_at", { ascending: false });
      if (!includeClosed) q = q.is("closed_at", null);
      if (direction) q = q.eq("direction", direction);

      const { data, error } = await q;
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        id: string;
        open_thread_relationships?: { relationship_id: string }[];
        [k: string]: unknown;
      }>;

      if (relationshipId) {
        return rows.filter((r) =>
          (r.open_thread_relationships ?? []).some(
            (l) => l.relationship_id === relationshipId,
          ),
        );
      }
      return rows;
    }
    case "list_interactions": {
      let q = ctx.supabase
        .from("interactions")
        .select(
          "id, time, kind, notes, status, interaction_contacts(contact_id, contacts(name))",
        )
        .order("time", { ascending: false })
        .limit(200);
      if (input.status)
        q = q.eq("status", input.status as string);
      if (input.since)
        q = q.gte("time", input.since as string);
      if (input.until)
        q = q.lte("time", input.until as string);
      const { data, error } = await q;
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        id: string;
        interaction_contacts?: { contact_id: string }[];
        [k: string]: unknown;
      }>;
      const contactId = input.contact_id as string | undefined;
      if (contactId) {
        return rows.filter((r) =>
          (r.interaction_contacts ?? []).some(
            (l) => l.contact_id === contactId,
          ),
        );
      }
      return rows;
    }
    case "list_calendar_events": {
      let q = ctx.supabase
        .from("inferred_signal_calendar")
        .select("id, summary, start_at, end_at, source")
        .order("start_at", { ascending: true })
        .limit(200);
      if (input.since) q = q.gte("start_at", input.since as string);
      if (input.until) q = q.lte("start_at", input.until as string);
      const { data, error } = await q;
      if (error) {
        // Table may be unmigrated for some tenants; degrade gracefully.
        return { error: error.message, events: [] };
      }
      return data;
    }
    case "list_groups": {
      const { data, error } = await ctx.supabase
        .from("groups")
        .select("id, name, created_at")
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    }
    case "get_group": {
      const { data, error } = await ctx.supabase
        .from("groups")
        .select(
          "id, name, created_at, contact_groups(contact_id, contacts(id, name))",
        )
        .eq("id", input.group_id as string)
        .single();
      if (error) throw error;
      return data;
    }
    case "get_user_context": {
      const goalsP = ctx.supabase
        .from("goals_and_values")
        .select("id, content, created_at, updated_at")
        .order("created_at", { ascending: false });
      const ssP = ctx.supabase
        .from("situational_state")
        .select("id, content, updated_at")
        .maybeSingle();
      const tiP = ctx.supabase
        .from("transient_intent")
        .select("id, content, captured_at, expires_at, relationship_id")
        .gt("expires_at", new Date().toISOString())
        .order("captured_at", { ascending: false })
        .limit(20);

      const [goals, ss, ti] = await Promise.all([goalsP, ssP, tiP]);
      if (goals.error) throw goals.error;
      if (ss.error) throw ss.error;
      if (ti.error) throw ti.error;

      return {
        goals_and_values: goals.data ?? [],
        situational_state: ss.data ?? null,
        transient_intent: ti.data ?? [],
      };
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

// =============================================================================
// Message conversion — chat_messages rows ↔ Anthropic content blocks.
// =============================================================================

interface ChatMessageRow {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls: unknown[] | null;
  tool_call_id: string | null;
  created_at: string;
}

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

interface ToolCallSummary {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result_preview: string;
  error?: string;
}

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
 */
async function streamToolLoop(
  anthropic: Anthropic,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  ctx: ToolContext,
  emit: (event: string, data: unknown) => void,
): Promise<{ text: string; toolCalls: ToolCallSummary[] }> {
  const toolCalls: ToolCallSummary[] = [];

  const working: Array<{
    role: "user" | "assistant";
    content: string | unknown[];
  }> = history.map((m) => ({ role: m.role, content: m.content }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
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
