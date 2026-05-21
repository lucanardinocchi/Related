// Engaged Pass Edge Function — wraps the Sonnet 4.6 call server-side so the
// ANTHROPIC_API_KEY never reaches the client bundle. The client sends an
// AgentPrompt; this function runs ClaudeAgent.propose against the live SDK
// and returns the parsed CandidateActionInput[].
//
// Deploy:
//   supabase functions deploy engaged-pass --no-verify-jwt=false
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Runtime: Deno (Supabase Edge Runtime). Tool schemas are mirrored from
// @related/shared in ./ambientTools.ts — same tools, same DoNothing-always invariant.

// deno-lint-ignore-file no-explicit-any
import Anthropic from "npm:@anthropic-ai/sdk@^0.96.0";
import {
  AMBIENT_TOOLS,
  TOOL_NAME_TO_ACTION_TYPE,
  ensureDoNothingPeer,
  type ParsedAmbientAction,
} from "./ambientTools.ts";

interface AgentPrompt {
  mode: "baseline" | "triggered" | "engaged";
  relationship: unknown;
  openThreads: unknown[];
  previousCandidateSet: unknown;
  userContext: unknown;
  liveContext?: unknown;
}

const SYSTEM_PROMPT = `You are the Ambient Intelligence agent for the Related app.

Your job: for a single Relationship, emit a Candidate Set — typed proposals the User can accept, edit, or decline. Use the provided tools; one tool_use per Candidate Action.

Rules:
- Emit as many Candidate Actions as are genuinely useful. There is no cap. There is no Snooze.
- DoNothing is always a peer option — leaving a Relationship alone is a legitimate decision, not default-by-inaction. (If you don't emit do_nothing yourself, the runtime will append one — but you should emit it when it's the real best option, with a one-line 'why'.)
- Strong continuity bias. If the previous Candidate Set is provided, default to keeping its candidates unless something materially changed (new Open Thread, recent Interaction, a Goals/Values edit, an Inferred-Signal shift, or the User declined the candidate last Pass). When you replace a previous candidate, supply a one-line 'why' explaining the change.
- Edits the User has already made on a previous candidate are signal: respect them. Decisions the User declined are signal: don't re-propose unchanged.
- Engaged mode: reason against the User's live Transient Intent if present. Baseline / Triggered: there is no live intent.
- Capability fit: \`userContext.operatorStrengths\` lists what the User is positioned to offer (e.g. domains of expertise, kinds of help they're willing to give). When the list is non-empty, every concrete Candidate Action you emit must route through one of these strengths — propose help the User can actually deliver, not help they cannot. If you identify a need for the Relationship but no candidate fits the User's strengths, emit DoNothing with a 'why' that names the gap (e.g. "they need legal advice; outside the User's declared strengths"). When the list is empty, treat the User as unrestricted, but don't invent capabilities the User hasn't declared.

Output: tool_use blocks only. One per Candidate Action.`;

function buildUserMessage(prompt: AgentPrompt): string {
  return JSON.stringify(
    {
      mode: prompt.mode,
      relationship: prompt.relationship,
      openThreads: prompt.openThreads,
      previousCandidateSet: prompt.previousCandidateSet,
      userContext: prompt.userContext,
      liveContext: prompt.liveContext ?? null,
    },
    null,
    2,
  );
}

function parseActions(content: unknown): ParsedAmbientAction[] {
  const blocks = (content ?? []) as Array<{
    type: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  const actions: ParsedAmbientAction[] = [];
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
  return ensureDoNothingPeer(actions);
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
      tools: AMBIENT_TOOLS as any,
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
