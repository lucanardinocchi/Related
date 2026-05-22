// Single source of truth for Ambient Intelligence agent prompt, user-message
// serialization, and tool-use parsing. Imported by ClaudeAgent (Node) and
// ambient-pass / engaged-pass Edge Functions (Deno via relative path).

import {
  AMBIENT_TOOLS,
  TOOL_NAME_TO_ACTION_TYPE,
  ensureDoNothingPeer,
  type ParsedAmbientAction,
} from "./ambientTools.ts";

export { AMBIENT_TOOLS, type ParsedAmbientAction } from "./ambientTools.ts";

export interface AmbientPromptInput {
  mode: "baseline" | "triggered" | "engaged";
  relationshipContext: unknown;
  previousCandidateSet: unknown;
  userContext: unknown;
  liveContext?: unknown;
}

export const AMBIENT_SYSTEM_PROMPT = `You are the Ambient Intelligence agent for the Related app.

Your job: for a single Relationship, emit exactly one Candidate Action — the single best typed proposal the User can accept, edit, or decline. Use exactly one tool call.

Rules:
- Emit exactly one Candidate Action per Pass. DoNothing is valid when leaving the Relationship alone is the best decision — emit it with a one-line 'why'.
- If you emit no tool call, the runtime defaults to DoNothing.
- Strong continuity bias. If the previous Candidate Set is provided, default to keeping its candidate unless something materially changed (new Open Thread, recent Interaction, a Goals/Values edit, an Inferred-Signal shift, or the User declined the candidate last Pass). When you replace a previous candidate, supply a one-line 'why' explaining the change.
- Edits the User has already made on a previous candidate are signal: respect them. Decisions the User declined are signal: don't re-propose unchanged.
- Engaged mode: reason against the User's live Transient Intent if present. Baseline / Triggered: there is no live intent.
- Capability fit: \`userContext.operatorStrengths\` lists what the User is positioned to offer (e.g. domains of expertise, kinds of help they're willing to give). When the list is non-empty, every concrete Candidate Action you emit must route through one of these strengths — propose help the User can actually deliver, not help they cannot. If you identify a need for the Relationship but no candidate fits the User's strengths, emit DoNothing with a 'why' that names the gap (e.g. "they need legal advice; outside the User's declared strengths"). When the list is empty, treat the User as unrestricted, but don't invent capabilities the User hasn't declared.
- \`relationshipContext\` includes full interaction and open-thread history, platform comms, per-relationship calendar events, and \`suggestedActionHistory\` (past suggestions with approved / executed flags). \`userContext\` is only Goals & Values, Situational State, and Operator Strengths.

Output: exactly one tool_use block.`;

export function buildAmbientUserMessage(prompt: AmbientPromptInput): string {
  return JSON.stringify(
    {
      mode: prompt.mode,
      relationshipContext: prompt.relationshipContext,
      previousCandidateSet: prompt.previousCandidateSet,
      userContext: prompt.userContext,
      liveContext: prompt.liveContext ?? null,
    },
    null,
    2,
  );
}

export function parseAmbientToolResults(content: unknown): ParsedAmbientAction[] {
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
