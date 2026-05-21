// extract-context Edge Function — Extraction Pass per ADR-0009 (amended
// 2026-05-21 to add Relationship Context as a write surface).
//
// Runs over the transcript of a closed Chat. Sorts the User's narrative
// content by Relationship and writes:
//   - situational_state — User-wide self-narrative (singleton, replace).
//   - transient_intent — User-wide ephemeral intents (append, 7-day decay).
//   - relationship_context — per-Relationship narrative (singleton per
//     Relationship, replace). Group context fans out: holistic chunk on
//     the Group Relationship + member-specific slices on each member's
//     Contact Relationship.
//
// Does NOT write to:
//   - goals_and_values (User-authored only — glossary invariant).
//   - operational entities (Interactions, Open Threads, role/cadence) —
//     those remain Candidate-gated.
//
// Read tools mirror chat-respond so the model can resolve names to
// Relationships and disambiguate. Ambiguity is over-attributed (write to
// all plausible matches with an inline marker) rather than dropped, on
// the basis that Conversational Intelligence is expected to disambiguate
// live during the Chat.
//
// Triggered exactly once per Chat after the User closes it. Idempotent on
// chats.extracted_at — replays short-circuit.
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy extract-context

// deno-lint-ignore-file no-explicit-any

import Anthropic from "npm:@anthropic-ai/sdk@^0.96.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;
const MAX_ROUNDS = 8;

// Default Transient Intent half-life: 7 days from chat closed_at.
// "Ephemeral, decays" per CONTEXT.md.
const DEFAULT_TI_LIFETIME_DAYS = 7;

const SYSTEM_PROMPT = `You are the Extraction Pass for Related — a relationship-intelligence app.

You read the transcript of a closed conversation between the User and the Conversational Intelligence agent and route everything the User said into the right buckets. You do NOT respond conversationally. You CALL TOOLS.

# Buckets — what is each one for

- **Situational State** (User-wide singleton) — medium-term truths about the User's life. "Just moved to Sydney." "Recovering from a knee injury." Replace the whole text. 3–6 sentences. Preserve what's still true from the prior text; remove what's contradicted; add what's new.
- **Transient Intent** (User-wide, decays in 7 days) — ephemeral User intents. "Want to plan a birthday for Sam." One short sentence per distinct intent.
- **Relationship Context** (per Relationship, singleton per Relationship) — what is currently true about a single bond. One row per Relationship; Relationships can target a single Contact OR a Group (both are first-class). 3–6 sentences. Replace the whole text per Relationship, preserving still-true content from the prior text. Narrative state only — describing the Relationship, not committing actions on it.
- (You do NOT write Goals & Values, Interactions, Open Threads, or role/cadence. Those are User-authored or Candidate-gated.)

# How to sort the transcript

You have read tools to enumerate the User's Relationships, Contacts, and Groups. Use them BEFORE writing — you need real Relationship ids and you need to know who's in what Group.

Work in passes:

1. **Group sort.** For each Group the User discusses, capture the chunk of the transcript that's about the Group as a whole (the group dynamic, what happened together, the collective vibe) and write it to that Group's Relationship Context via \`upsert_relationship_context\` keyed on the Group's Relationship id.

2. **Member fan-out.** Within each Group-context chunk, look for fragments that speak to a specific member's individual action or state ("Sam said X", "Priya seemed off", "Jules and I had a side conversation"). Write those fragments additionally to the member Contact's Relationship Context, keyed on that Contact's Relationship id. The Group Relationship keeps the holistic chunk; the member Relationship gets the individually-relevant slice. A single fact about one member surfaces in BOTH places — that's correct.

3. **Direct individual mentions.** For each Contact the User discusses outside any Group framing, write the relevant chunk to that Contact's Relationship Context.

4. **User self-narrative.** Anything about the User's own life (not about any specific other person or group) goes to Situational State via \`upsert_situational_state\`. Ephemeral User intents — what they're trying to do right now — go to Transient Intent via \`capture_transient_intent\`. If a Transient Intent is clearly about a specific Relationship (e.g. "I want to plan a party for Sam"), set its \`relationship_id\` to that Relationship.

# Merge contract for Relationship Context

When you call \`upsert_relationship_context\` for a Relationship, you are REPLACING the prior text. Always call \`get_relationship_context\` first to read what's already there, then produce a new paragraph that preserves what is still true, removes what is contradicted by this Chat, and adds what is new. Same contract as Situational State, scoped per Relationship.

# Naming ambiguity

Conversational Intelligence is expected to disambiguate names live during the Chat (it has the read tools and a prompt rule to do so). If you encounter a name in the transcript that resolves to more than one Contact AND it's clear from the surrounding context which one is meant, write to that one. If it's NOT clear after looking at the candidates' profile and the transcript context, write the relevant content to ALL plausible matches' Relationship Contexts, prefixing the ambiguous fragment with an inline marker like \`[possibly also refers to: Other Name]\`. Over-attribute rather than drop — the User can correct later. NEVER skip a fragment silently because of ambiguity.

# Style

- Conservative on User self-narrative (Situational State / Transient Intent): if the transcript is small-talk with no self-narrative, write nothing in those buckets.
- Aggressive on Relationship Context: if the User said anything substantive about a Relationship, capture it. Per-Relationship narrative compounds in value over time.
- Plain prose. No headings, no lists. 3–6 sentences per Relationship Context, 3–6 for Situational State, one sentence per Transient Intent.

# Finishing

After all your write tool calls, finish with a single empty text response.`;

const TOOLS = [
  // --- read tools (mirror chat-respond's surface) -------------------------
  {
    name: "list_relationships",
    description:
      "List all of the User's Relationships. Each Relationship has an id, a target_type ('contact' or 'group'), and the target Contact or Group attached. Use this to find the right relationship_id when writing per-Relationship narrative.",
    input_schema: {
      type: "object",
      properties: {
        target_type: {
          type: "string",
          enum: ["contact", "group", "all"],
          description: "Filter to contact-targeted, group-targeted, or all (default).",
        },
      },
    },
  },
  {
    name: "get_relationship",
    description:
      "Get one Relationship by id with full Contact (or Group) profile attached.",
    input_schema: {
      type: "object",
      required: ["relationship_id"],
      properties: { relationship_id: { type: "string" } },
    },
  },
  {
    name: "list_contacts",
    description:
      "List all the User's Contacts. A Contact is a referenced person; the Relationship that wraps them is the entity you write narrative against.",
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
    name: "list_groups",
    description: "List the User's Groups (named collections of Contacts).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_group",
    description:
      "Get a Group by id with the member Contacts attached. Use this for member fan-out — you need the member Contact ids to find their Relationships.",
    input_schema: {
      type: "object",
      required: ["group_id"],
      properties: { group_id: { type: "string" } },
    },
  },
  {
    name: "get_relationship_context",
    description:
      "Read the current Relationship Context for a given Relationship (Contact-targeted or Group-targeted). Returns null when none exists yet. Call this before upsert so your replacement preserves what's still true.",
    input_schema: {
      type: "object",
      required: ["relationship_id"],
      properties: { relationship_id: { type: "string" } },
    },
  },

  // --- write tools --------------------------------------------------------
  {
    name: "upsert_situational_state",
    description:
      "Replace the User's Situational State (User-wide singleton) with a new paragraph capturing what is currently true about their life. 3–6 sentences. Preserve still-true prior content; remove contradicted; add new.",
    input_schema: {
      type: "object",
      required: ["content"],
      properties: {
        content: {
          type: "string",
          description: "Full new Situational State text. REPLACES prior state.",
        },
      },
    },
  },
  {
    name: "capture_transient_intent",
    description:
      "Capture one ephemeral intent the User expressed. Multiple calls allowed — one per distinct intent. Decays 7 days from chat close.",
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
            "Optional Relationship the intent targets. Set when the intent is clearly about a specific person or group.",
        },
      },
    },
  },
  {
    name: "upsert_relationship_context",
    description:
      "Replace the Relationship Context for a single Relationship (Contact-targeted or Group-targeted). 3–6 sentences describing what is currently true about the bond. Preserve still-true prior content; remove contradicted; add new. Call get_relationship_context first to read prior content.",
    input_schema: {
      type: "object",
      required: ["relationship_id", "content"],
      properties: {
        relationship_id: {
          type: "string",
          description:
            "The Relationship.id (NOT the Contact.id or Group.id). Use list_relationships / get_relationship to resolve.",
        },
        content: {
          type: "string",
          description:
            "Full new Relationship Context text. REPLACES prior text for this Relationship.",
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

interface ExtractionSummary {
  situationalStateUpdated: boolean;
  intentsCaptured: number;
  relationshipsTouched: Set<string>;
  toolErrors: string[];
}

async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
  summary: ExtractionSummary,
): Promise<unknown> {
  switch (name) {
    // --- read dispatchers -------------------------------------------------
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
          "id, name, created_at, contact_groups(contact_id, contacts(id, name)), relationships(id)",
        )
        .eq("id", input.group_id as string)
        .single();
      if (error) throw error;
      return data;
    }
    case "get_relationship_context": {
      const { data, error } = await ctx.supabase
        .from("relationship_context")
        .select("id, relationship_id, content, source_chat_id, updated_at")
        .eq("relationship_id", input.relationship_id as string)
        .maybeSingle();
      if (error) throw error;
      return data ?? { relationship_id: input.relationship_id, content: null };
    }

    // --- write dispatchers ------------------------------------------------
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
      summary.situationalStateUpdated = true;
      return { ok: true, situational_state: data };
    }
    case "capture_transient_intent": {
      const content = input.content as string;
      if (!content || typeof content !== "string") {
        throw new Error("content required");
      }
      const relationshipId =
        (input.relationship_id as string | undefined) || null;
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
      summary.intentsCaptured += 1;
      return { ok: true, transient_intent: data };
    }
    case "upsert_relationship_context": {
      const relationshipId = input.relationship_id as string;
      const content = input.content as string;
      if (!relationshipId || typeof relationshipId !== "string") {
        throw new Error("relationship_id required");
      }
      if (!content || typeof content !== "string") {
        throw new Error("content required");
      }
      const { data, error } = await ctx.supabase
        .from("relationship_context")
        .upsert(
          {
            owner_id: ctx.ownerId,
            relationship_id: relationshipId,
            content,
            source_chat_id: ctx.chatId,
          },
          { onConflict: "relationship_id" },
        )
        .select("id, relationship_id, content, updated_at")
        .single();
      if (error) throw error;
      summary.relationshipsTouched.add(relationshipId);
      return { ok: true, relationship_context: data };
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

async function runExtraction(
  anthropic: Anthropic,
  transcript: string,
  priorSituationalState: string | null,
  ctx: ToolContext,
): Promise<ExtractionSummary> {
  const summary: ExtractionSummary = {
    situationalStateUpdated: false,
    intentsCaptured: 0,
    relationshipsTouched: new Set<string>(),
    toolErrors: [],
  };

  const userMessage = `Prior Situational State:
${priorSituationalState ?? "(none yet)"}

Transcript of the closed Chat:
${transcript}

Sort the transcript per the system prompt. Use the read tools to enumerate Relationships / Contacts / Groups and to read prior Relationship Context before each upsert. Then write to the right buckets.`;

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
          const result = await dispatchTool(
            tu.name ?? "",
            (tu.input ?? {}) as Record<string, unknown>,
            ctx,
            summary,
          );
          const json = JSON.stringify(result);
          const truncated =
            json.length > 6000 ? json.slice(0, 6000) + "…" : json;
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: truncated,
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
        relationshipsTouched: [],
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
      situationalStateUpdated: summary.situationalStateUpdated,
      intentsCaptured: summary.intentsCaptured,
      relationshipsTouched: Array.from(summary.relationshipsTouched),
      toolErrors: summary.toolErrors,
    }),
    { headers: { ...CORS_HEADERS, "content-type": "application/json" } },
  );
});
