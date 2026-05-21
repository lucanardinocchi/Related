// extract-context Edge Function — Extraction Pass per ADR-0009.
//
// Runs over the transcript of a closed Chat and writes the User's
// self-narrative content into User Context. Writes ONLY to:
//   - situational_state (singleton, replace whole text)
//   - transient_intent (multi-row, append with decay)
//
// Does NOT write to:
//   - goals_and_values (User-authored only — glossary invariant + ADR-0009 (α))
//   - any operational entity (Interactions, Open Threads, Relationships) —
//     those remain gated by the Candidate Action invariant.
//
// Triggered exactly once per Chat after the User closes it. Idempotent
// at the application boundary: replays of the same closed Chat re-run
// the extraction (overwriting Situational State; appending Transient
// Intent rows would duplicate, so the function refuses to re-run on a
// Chat that has already had Extraction recorded — see chats.extracted_at
// added by migration).
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy extract-context
//
// deno-lint-ignore-file no-explicit-any

import Anthropic from "npm:@anthropic-ai/sdk@^0.96.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;
const MAX_ROUNDS = 4;

// Default Transient Intent half-life: 7 days from chat closed_at.
// "Ephemeral, decays" per CONTEXT.md — short enough to not bias the
// agent weeks later, long enough to inform the next few Ambient Passes.
const DEFAULT_TI_LIFETIME_DAYS = 7;

const SYSTEM_PROMPT = `You are the Extraction Pass for Related — a relationship-intelligence app.

Your job: read the transcript of a closed conversation between the User and the Conversational Intelligence agent. Extract the User's self-narrative content and route it to the right User Context bucket. You do NOT respond conversationally. You CALL TOOLS.

What goes where:
- **Situational State** = medium-term, current life context. The User's situation now and over the next weeks/months. Examples: "Just moved to Sydney." "Trying to be more present with family this year." "Recovering from a knee injury." "Working on a startup with two co-founders." Replace the User's whole Situational State with a paragraph (3–6 sentences) capturing what is currently true about their life situation. Preserve anything still true from the prior Situational State; remove anything contradicted; add anything new.
- **Transient Intent** = ephemeral, in-the-moment intents. Decays after 7 days. Use one capture per distinct intent. Examples: "Wants to plan a birthday party for Sam." "Worried about Priya's wellbeing this week." "Trying to figure out whether to invite Jules to the trip." Each capture is 1 short sentence.

What you do NOT touch:
- Goals & Values — User-authored only. If the User said "I want to be more present with family", that's Situational State, not a Goal.
- Interactions, Open Threads, Relationships, Contacts, Groups — operational entities. The User's words in this Chat will inform the next Ambient Intelligence Pass via the User Context you write here, but you do not directly create or mutate those entities.

Be conservative. If the transcript is small-talk with no self-narrative, call no tools — that's a valid output. If a single update covers everything, one tool call is enough.

After all extraction tool calls, finish with a single empty text response.`;

const TOOLS = [
  {
    name: "upsert_situational_state",
    description:
      "Replace the User's Situational State with a new paragraph capturing what is currently true about their life. Merges prior + transcript content; the agent provides the full new text (singleton row).",
    input_schema: {
      type: "object",
      required: ["content"],
      properties: {
        content: {
          type: "string",
          description:
            "Full new Situational State text. 3–6 sentences. Will REPLACE prior state.",
        },
      },
    },
  },
  {
    name: "capture_transient_intent",
    description:
      "Capture one ephemeral intent the User expressed. Multiple calls allowed per Extraction Pass — one per distinct intent. Decays 7 days from now.",
    input_schema: {
      type: "object",
      required: ["content"],
      properties: {
        content: {
          type: "string",
          description: "One short sentence describing the intent.",
        },
        relationship_id: {
          type: "string",
          description:
            "Optional Relationship the intent targets. Set when the intent is clearly about a specific person or group. Otherwise omit.",
        },
      },
    },
  },
] as const;

interface ToolContext {
  supabase: SupabaseClient;
  ownerId: string;
  chatId: string;
  expiresAt: string;
}

async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (name) {
    case "upsert_situational_state": {
      const content = input.content as string;
      if (!content || typeof content !== "string") {
        throw new Error("content required");
      }
      const { data, error } = await ctx.supabase
        .from("situational_state")
        .upsert(
          { owner_id: ctx.ownerId, content },
          { onConflict: "owner_id" },
        )
        .select("id, content, updated_at")
        .single();
      if (error) throw error;
      return { ok: true, situational_state: data };
    }
    case "capture_transient_intent": {
      const content = input.content as string;
      if (!content || typeof content !== "string") {
        throw new Error("content required");
      }
      const relationshipId = (input.relationship_id as string | undefined) || null;
      const { data, error } = await ctx.supabase
        .from("transient_intent")
        .insert({
          owner_id: ctx.ownerId,
          session_id: ctx.chatId,
          relationship_id: relationshipId,
          content,
          expires_at: ctx.expiresAt,
        })
        .select("id, content, expires_at")
        .single();
      if (error) throw error;
      return { ok: true, transient_intent: data };
    }
    default:
      throw new Error(`unknown extraction tool: ${name}`);
  }
}

interface MessageRow {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  created_at: string;
}

function formatTranscript(rows: MessageRow[]): string {
  return rows
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => {
      const speaker = r.role === "user" ? "USER" : "AGENT";
      return `[${speaker}] ${r.content}`;
    })
    .join("\n\n");
}

interface ExtractionSummary {
  situationalStateUpdated: boolean;
  intentsCaptured: number;
  toolErrors: string[];
}

async function runExtraction(
  anthropic: Anthropic,
  transcript: string,
  priorSituationalState: string | null,
  ctx: ToolContext,
): Promise<ExtractionSummary> {
  const summary: ExtractionSummary = {
    situationalStateUpdated: false,
    intentsCaptured: 0,
    toolErrors: [],
  };

  const userMessage = `Prior Situational State:
${priorSituationalState ?? "(none yet)"}

Transcript of the closed Chat:
${transcript}

Extract Situational State updates and Transient Intent captures from the User's content above.`;

  const working: Array<{
    role: "user" | "assistant";
    content: string | unknown[];
  }> = [{ role: "user", content: userMessage }];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: TOOLS as any,
      messages: working as any,
    });

    const blocks = (resp.content ?? []) as Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;

    const toolUses = blocks.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) {
      return summary;
    }

    working.push({ role: "assistant", content: blocks });

    const results = await Promise.all(
      toolUses.map(async (tu) => {
        try {
          await dispatchTool(
            tu.name ?? "",
            (tu.input ?? {}) as Record<string, unknown>,
            ctx,
          );
          if (tu.name === "upsert_situational_state") {
            summary.situationalStateUpdated = true;
          } else if (tu.name === "capture_transient_intent") {
            summary.intentsCaptured += 1;
          }
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: '{"ok":true}',
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          summary.toolErrors.push(`${tu.name}: ${message}`);
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

  return summary;
}

// =============================================================================
// Request handler.
// =============================================================================

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") return jsonError(405, "method not allowed");
  if (!ANTHROPIC_API_KEY) {
    return jsonError(500, "ANTHROPIC_API_KEY not configured");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonError(401, "missing Authorization header");

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

  const userRes = await supabase.auth.getUser();
  if (userRes.error || !userRes.data.user) {
    return jsonError(401, "auth failed");
  }
  const ownerId = userRes.data.user.id;

  const chatRes = await supabase
    .from("chats")
    .select("id, owner_id, closed_at, extracted_at")
    .eq("id", body.chatId)
    .single();
  if (chatRes.error || !chatRes.data) {
    return jsonError(404, "chat not found");
  }
  if (chatRes.data.owner_id !== ownerId) {
    return jsonError(403, "not your chat");
  }
  if (!chatRes.data.closed_at) {
    return jsonError(409, "chat is still open; close it before extraction");
  }
  if (chatRes.data.extracted_at) {
    return new Response(
      JSON.stringify({
        skipped: true,
        reason: "already extracted",
        extracted_at: chatRes.data.extracted_at,
      }),
      { headers: { ...CORS_HEADERS, "content-type": "application/json" } },
    );
  }

  const msgRes = await supabase
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("chat_id", body.chatId)
    .order("created_at", { ascending: true });
  if (msgRes.error) {
    return jsonError(500, `failed to load messages: ${msgRes.error.message}`);
  }
  const rows = (msgRes.data ?? []) as MessageRow[];
  if (rows.length === 0) {
    // Empty chat — nothing to extract. Mark extracted to keep idempotency.
    await supabase
      .from("chats")
      .update({ extracted_at: new Date().toISOString() })
      .eq("id", body.chatId);
    return new Response(
      JSON.stringify({
        skipped: true,
        reason: "empty transcript",
        situationalStateUpdated: false,
        intentsCaptured: 0,
      }),
      { headers: { ...CORS_HEADERS, "content-type": "application/json" } },
    );
  }

  const transcript = formatTranscript(rows);

  const ssRes = await supabase
    .from("situational_state")
    .select("content")
    .maybeSingle();
  const priorSS = ssRes.data?.content ?? null;

  const closedAt = chatRes.data.closed_at as string;
  const closedAtMs = new Date(closedAt).getTime();
  const expiresAt = new Date(
    closedAtMs + DEFAULT_TI_LIFETIME_DAYS * 86400 * 1000,
  ).toISOString();

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  let summary: ExtractionSummary;
  try {
    summary = await runExtraction(anthropic, transcript, priorSS, {
      supabase,
      ownerId,
      chatId: body.chatId,
      expiresAt,
    });
  } catch (err) {
    return jsonError(
      502,
      `extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Mark the chat extracted so we never re-run on it.
  const stamp = await supabase
    .from("chats")
    .update({ extracted_at: new Date().toISOString() })
    .eq("id", body.chatId)
    .select("extracted_at")
    .single();
  if (stamp.error) {
    return jsonError(
      500,
      `extraction succeeded but failed to mark chat extracted: ${stamp.error.message}`,
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      extracted_at: stamp.data.extracted_at,
      ...summary,
    }),
    { headers: { ...CORS_HEADERS, "content-type": "application/json" } },
  );
});
