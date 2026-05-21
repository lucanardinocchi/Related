// Engaged Pass Edge Function — wraps the Sonnet 4.6 call server-side so the
// ANTHROPIC_API_KEY never reaches the client bundle. The client sends an
// AgentPrompt; this function runs ClaudeAgent.propose against the live SDK
// and returns the parsed CandidateActionInput[].
//
// Deploy:
//   supabase functions deploy engaged-pass --no-verify-jwt=false
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Runtime: Deno (Supabase Edge Runtime). Imports the shared ClaudeAgent from
// the workspace via the published NPM specifier once @related/shared is on
// npm, OR — for now — inlines the tool schema and tool-name mapping so this
// function is self-contained at deploy time. The contract is the same as
// ClaudeAgent: same tools, same DoNothing-always invariant.

// deno-lint-ignore-file no-explicit-any
import Anthropic from "npm:@anthropic-ai/sdk@^0.96.0";

interface AgentPrompt {
  mode: "baseline" | "triggered" | "engaged";
  relationship: unknown;
  openThreads: unknown[];
  previousCandidateSet: unknown;
  userContext: unknown;
  relationshipContext?: string | null;
  liveContext?: unknown;
}

interface CandidateActionInput {
  type: string;
  payload?: unknown;
  why?: string;
}

const WHY_FIELD = {
  why: {
    type: "string",
    description:
      "One-line rationale visible on the card. Required when this candidate replaces a previous one with a different stance; otherwise optional.",
  },
};

const TOOLS = [
  {
    name: "schedule_interaction",
    description:
      "Propose a future Interaction. Creates an Interaction with status='planned'.",
    input_schema: {
      type: "object",
      required: ["time", "kind", "contactIds"],
      properties: {
        time: { type: "string", description: "ISO-8601 timestamp." },
        kind: { type: "string" },
        notes: { type: "string" },
        contactIds: { type: "array", items: { type: "string" } },
        ...WHY_FIELD,
      },
    },
  },
  {
    name: "log_interaction",
    description:
      "Record a past Interaction. Creates an Interaction with status='occurred'.",
    input_schema: {
      type: "object",
      required: ["time", "kind", "contactIds"],
      properties: {
        time: { type: "string" },
        kind: { type: "string" },
        notes: { type: "string" },
        contactIds: { type: "array", items: { type: "string" } },
        ...WHY_FIELD,
      },
    },
  },
  {
    name: "send_message",
    description:
      "Open the system composer pre-filled with a draft. The User can edit before sending.",
    input_schema: {
      type: "object",
      required: ["channel", "contactIds", "body"],
      properties: {
        channel: { type: "string", enum: ["text", "email"] },
        contactIds: { type: "array", items: { type: "string" } },
        subject: { type: "string" },
        body: { type: "string" },
        ...WHY_FIELD,
      },
    },
  },
  {
    name: "open_thread",
    description: "Open a new Open Thread on the focused Relationship.",
    input_schema: {
      type: "object",
      required: ["description", "direction"],
      properties: {
        description: { type: "string" },
        direction: { type: "string", enum: ["me_owes_them", "they_owe_me"] },
        ...WHY_FIELD,
      },
    },
  },
  {
    name: "close_thread",
    description:
      "Close an existing Open Thread. Multi-Relationship Threads close on every linked Relationship.",
    input_schema: {
      type: "object",
      required: ["openThreadId"],
      properties: {
        openThreadId: { type: "string" },
        ...WHY_FIELD,
      },
    },
  },
  {
    name: "update_role_or_cadence",
    description:
      "Mutate Relationship fields. Use for stance changes ('close friend' → 'acquaintance') or cadence preferences.",
    input_schema: {
      type: "object",
      properties: {
        role: { type: "string" },
        cadence: { type: "string" },
        ...WHY_FIELD,
      },
    },
  },
  {
    name: "do_nothing",
    description:
      "Surface 'do nothing' as a peer option. Required: every Candidate Set must include this.",
    input_schema: { type: "object", properties: { ...WHY_FIELD } },
  },
];

const TOOL_NAME_TO_ACTION_TYPE: Record<string, string> = {
  schedule_interaction: "ScheduleInteraction",
  log_interaction: "LogInteraction",
  send_message: "SendMessage",
  open_thread: "OpenThread",
  close_thread: "CloseThread",
  update_role_or_cadence: "UpdateRoleOrCadence",
  do_nothing: "DoNothing",
};

const SYSTEM_PROMPT = `You are the Ambient Intelligence agent for the Related app.

Your job: for a single Relationship, emit a Candidate Set — typed proposals the User can accept, edit, or decline. Use the provided tools; one tool_use per Candidate Action.

Rules:
- Emit as many Candidate Actions as are genuinely useful. There is no cap. There is no Snooze.
- DoNothing is always a peer option — leaving a Relationship alone is a legitimate decision, not default-by-inaction. (If you don't emit do_nothing yourself, the runtime will append one — but you should emit it when it's the real best option, with a one-line 'why'.)
- Strong continuity bias. If the previous Candidate Set is provided, default to keeping its candidates unless something materially changed (new Open Thread, recent Interaction, a Goals/Values edit, an Inferred-Signal shift, or the User declined the candidate last Pass). When you replace a previous candidate, supply a one-line 'why' explaining the change.
- Edits the User has already made on a previous candidate are signal: respect them. Decisions the User declined are signal: don't re-propose unchanged.
- Engaged mode: reason against the User's live Transient Intent if present. Baseline / Triggered: there is no live intent.
- The prompt may include \`relationshipContext\` — a paragraph of per-Relationship narrative written by the Extraction Pass (or edited directly by the User) over recent Chat transcripts. Treat it as recent ground truth about what is true about this bond. Narrative state, not a directive; do not echo it verbatim in a candidate's 'why' string.

Output: tool_use blocks only. One per Candidate Action.`;

function buildUserMessage(prompt: AgentPrompt): string {
  return JSON.stringify(
    {
      mode: prompt.mode,
      relationship: prompt.relationship,
      relationshipContext: prompt.relationshipContext ?? null,
      openThreads: prompt.openThreads,
      previousCandidateSet: prompt.previousCandidateSet,
      userContext: prompt.userContext,
      liveContext: prompt.liveContext ?? null,
    },
    null,
    2,
  );
}

function parseActions(content: unknown): CandidateActionInput[] {
  const blocks = (content ?? []) as Array<{
    type: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  const actions: CandidateActionInput[] = [];
  for (const block of blocks) {
    if (block.type !== "tool_use") continue;
    const actionType = TOOL_NAME_TO_ACTION_TYPE[block.name ?? ""];
    if (!actionType) continue;
    const input = (block.input ?? {}) as Record<string, unknown>;
    const { why, ...payload } = input;
    actions.push({
      type: actionType,
      payload,
      why: typeof why === "string" ? why : undefined,
    });
  }
  if (!actions.some((a) => a.type === "DoNothing")) {
    actions.push({ type: "DoNothing", payload: {} });
  }
  return actions;
}

const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
if (!apiKey) {
  console.warn("ANTHROPIC_API_KEY is not set in the function environment");
}
const anthropic = new Anthropic({ apiKey });

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }
  let body: { prompt?: AgentPrompt };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const prompt = body.prompt;
  if (!prompt || typeof prompt.mode !== "string") {
    return new Response(
      JSON.stringify({ error: "missing or malformed `prompt`" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS as any,
      messages: [{ role: "user", content: buildUserMessage(prompt) }],
    });
    const actions = parseActions(response.content);
    return new Response(JSON.stringify({ actions }), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
});
