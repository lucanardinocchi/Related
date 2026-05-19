import type { AgentCaller, AgentPrompt, CandidateActionInput } from "./PassEngine";

export interface AnthropicMessagesClient {
  messages: {
    create: (req: unknown) => Promise<{ content: unknown[] }>;
  };
}

export interface ClaudeAgentOptions {
  client: AnthropicMessagesClient;
}

interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

const WHY_FIELD = {
  why: {
    type: "string",
    description:
      "One-line rationale visible on the card. Required when this candidate replaces a previous one with a different stance; otherwise optional.",
  },
};

const TOOLS: ToolDefinition[] = [
  {
    name: "schedule_interaction",
    description:
      "Propose a future Interaction. Creates an Interaction with status='planned'.",
    input_schema: {
      type: "object",
      required: ["time", "kind", "contactIds"],
      properties: {
        time: { type: "string", description: "ISO-8601 timestamp." },
        kind: {
          type: "string",
          description: "e.g. coffee, call, dinner, catch-up, birthday.",
        },
        notes: { type: "string" },
        contactIds: {
          type: "array",
          items: { type: "string" },
          description: "Contact ids on the focused Relationship.",
        },
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
        contactIds: {
          type: "array",
          items: { type: "string" },
        },
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
        subject: { type: "string", description: "Email only." },
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
        direction: {
          type: "string",
          enum: ["me_owes_them", "they_owe_me"],
        },
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
      "Surface 'do nothing' as a peer option. Required: every Candidate Set must include this so leaving a Relationship alone is a legitimate decision.",
    input_schema: {
      type: "object",
      properties: { ...WHY_FIELD },
    },
  },
];

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

const TOOL_NAME_TO_ACTION_TYPE: Record<string, string> = {
  schedule_interaction: "ScheduleInteraction",
  log_interaction: "LogInteraction",
  send_message: "SendMessage",
  open_thread: "OpenThread",
  close_thread: "CloseThread",
  update_role_or_cadence: "UpdateRoleOrCadence",
  do_nothing: "DoNothing",
};

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
      tools: TOOLS,
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

    // DoNothing must always be a peer option per the glossary — leaving a
    // Relationship alone is a legitimate decision, not default-by-inaction.
    if (!actions.some((a) => a.type === "DoNothing")) {
      actions.push({ type: "DoNothing", payload: {} });
    }
    return actions;
  }
}
