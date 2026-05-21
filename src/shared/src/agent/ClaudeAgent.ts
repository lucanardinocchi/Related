import type { AgentCaller, AgentPrompt, CandidateActionInput } from "./PassEngine";
import {
  AMBIENT_TOOLS,
  TOOL_NAME_TO_ACTION_TYPE,
  ensureDoNothingPeer,
} from "./ambientTools";

export interface AnthropicMessagesClient {
  messages: {
    create: (req: unknown) => Promise<{ content: unknown[] }>;
  };
}

export interface ClaudeAgentOptions {
  client: AnthropicMessagesClient;
}

const SYSTEM_PROMPT = `You are the Ambient Intelligence agent for the Related app.

Your job: for a single Relationship, emit a Candidate Set — typed proposals the User can accept, edit, or decline. Use the provided tools; one tool_use per Candidate Action.

Rules:
- Emit as many Candidate Actions as are genuinely useful. There is no cap. There is no Snooze.
- DoNothing is always a peer option — leaving a Relationship alone is a legitimate decision, not default-by-inaction. (If you don't emit do_nothing yourself, the runtime will append one — but you should emit it when it's the real best option, with a one-line 'why'.)
- Strong continuity bias. If the previous Candidate Set is provided, default to keeping its candidates unless something materially changed (new Open Thread, recent Interaction, a Goals/Values edit, an Inferred-Signal shift, or the User declined the candidate last Pass). When you replace a previous candidate, supply a one-line 'why' explaining the change.
- Edits the User has already made on a previous candidate are signal: respect them. Decisions the User declined are signal: don't re-propose unchanged.
- Engaged mode: reason against the User's live Transient Intent if present. Baseline / Triggered: there is no live intent.

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

export class ClaudeAgent implements AgentCaller {
  private readonly client: AnthropicMessagesClient;

  constructor(opts: ClaudeAgentOptions) {
    this.client = opts.client;
  }

  async propose(prompt: AgentPrompt): Promise<CandidateActionInput[]> {
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: AMBIENT_TOOLS,
      messages: [{ role: "user", content: buildUserMessage(prompt) }],
    });

    const blocks = (response.content ?? []) as Array<{
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

    return ensureDoNothingPeer(actions);
  }
}
