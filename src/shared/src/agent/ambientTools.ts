// Ambient Intelligence tool definitions — single source of truth for ClaudeAgent
// and Edge Functions (imported via ambientAgentCore.ts relative path).

export interface AmbientToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type MessageChannel = "text" | "email";
export type ThreadDirection = "me_owes_them" | "they_owe_me";

export interface ScheduleInteractionPayload {
  time: string;
  kind: string;
  notes?: string;
  contactIds: string[];
}

export interface LogInteractionPayload {
  time: string;
  kind: string;
  notes?: string;
  contactIds: string[];
}

export interface SendMessageToolPayload {
  channel: MessageChannel;
  contactIds: string[];
  subject?: string;
  body: string;
}

export interface OpenThreadToolPayload {
  description: string;
  direction: ThreadDirection;
}

export interface CloseThreadPayload {
  openThreadId: string;
}

export interface UpdateRoleOrCadencePayload {
  role?: string;
  cadence?: string;
}

const WHY_FIELD = {
  why: {
    type: "string",
    description:
      "One or two sentences shown on the card. Cite specific evidence from the provided context (names, dates, last message snippet, open-thread title, calendar event, prior candidate outcome) — not generic advice. Required when replacing a previous candidate; strongly recommended for every concrete action and DoNothing.",
  },
};

export const AMBIENT_TOOLS: AmbientToolDefinition[] = [
  {
    name: "schedule_interaction",
    description:
      "Propose a future Interaction (status='planned'). Pick a realistic time from calendar gaps, cadence, and relationshipContext — not a vague 'soon'. Use notes for how to run it when non-obvious (venue, agenda, what to follow up on).",
    input_schema: {
      type: "object",
      required: ["time", "kind", "contactIds", "notes"],
      properties: {
        time: {
          type: "string",
          description:
            "ISO-8601 timestamp with timezone. Concrete slot (e.g. next Tuesday 6pm), not midnight placeholders unless context supports it.",
        },
        kind: {
          type: "string",
          description:
            "Specific format: e.g. '30-min video call', 'birthday dinner', 'walk-and-coffee' — not just 'catch-up'.",
        },
        notes: {
          type: "string",
          description:
            "Execution detail: where/how, talking points tied to context, or prep (e.g. 'Ask about their job interview you mentioned 12 May').",
        },
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
      "Record a past Interaction (status='occurred') only when context shows something already happened (comms, user note, implied meetup). Summarise what occurred specifically.",
    input_schema: {
      type: "object",
      required: ["time", "kind", "contactIds", "notes"],
      properties: {
        time: {
          type: "string",
          description: "ISO-8601 when it happened; infer from comms timestamps if needed.",
        },
        kind: {
          type: "string",
          description: "Specific format grounded in what actually occurred.",
        },
        notes: {
          type: "string",
          description:
            "What happened and outcomes worth remembering — tied to names/topics from context.",
        },
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
      "Draft a ready-to-send message in the User's voice. Reference specific shared context (last thread, event, promise). Avoid generic check-ins unless cadence truly demands it.",
    input_schema: {
      type: "object",
      required: ["channel", "contactIds", "body"],
      properties: {
        channel: { type: "string", enum: ["text", "email"] },
        contactIds: { type: "array", items: { type: "string" } },
        subject: {
          type: "string",
          description: "Email only — specific subject line, not 'Checking in'.",
        },
        body: {
          type: "string",
          description:
            "Full draft the User can send with light edits. Include concrete asks, dates, or callbacks from context.",
        },
        ...WHY_FIELD,
      },
    },
  },
  {
    name: "open_thread",
    description:
      "Track a specific obligation or follow-up visible in context. Description must state the exact commitment and trigger (who, what, by when).",
    input_schema: {
      type: "object",
      required: ["description", "direction"],
      properties: {
        description: {
          type: "string",
          description:
            "Precise thread title, e.g. 'You promised to intro Sam to their hiring manager after 3 May lunch' — not 'Follow up'.",
        },
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
      "Close an openThreadId from relationshipContext when evidence shows it is done. why must cite that evidence.",
    input_schema: {
      type: "object",
      required: ["openThreadId", "why"],
      properties: {
        openThreadId: {
          type: "string",
          description: "Exact id from relationshipContext.openThreads.",
        },
        ...WHY_FIELD,
      },
    },
  },
  {
    name: "update_role_or_cadence",
    description:
      "Propose a concrete role or cadence change grounded in interaction pattern or User goals — include at least one of role or cadence with specific wording.",
    input_schema: {
      type: "object",
      properties: {
        role: {
          type: "string",
          description:
            "New role label reflecting evidence, e.g. 'monthly coffee friend' not 'friend'.",
        },
        cadence: {
          type: "string",
          description:
            "Actionable cadence, e.g. 'text every 2–3 weeks; quarterly in-person' — not 'stay in touch'.",
        },
        ...WHY_FIELD,
      },
    },
  },
  {
    name: "do_nothing",
    description:
      "Default outcome when no concrete action is clearly warranted now. The User never sees this in Suggested actions. why must name what you checked (recent comms, threads, calendar) and why waiting is correct.",
    input_schema: {
      type: "object",
      properties: { ...WHY_FIELD },
    },
  },
];

export const TOOL_NAME_TO_ACTION_TYPE: Record<string, string> = {
  schedule_interaction: "ScheduleInteraction",
  log_interaction: "LogInteraction",
  send_message: "SendMessage",
  open_thread: "OpenThread",
  close_thread: "CloseThread",
  update_role_or_cadence: "UpdateRoleOrCadence",
  do_nothing: "DoNothing",
};

export interface ParsedAmbientAction {
  type: string;
  payload?: unknown;
  why?: string;
}

/** Normalize agent output to exactly one Candidate Action per Pass. */
export function ensureDoNothingPeer(
  actions: ParsedAmbientAction[],
): ParsedAmbientAction[] {
  if (actions.length === 0) {
    return [{ type: "DoNothing", payload: {} }];
  }
  if (actions.length === 1) {
    return actions;
  }
  const firstConcrete = actions.find((a) => a.type !== "DoNothing");
  return [firstConcrete ?? actions[0]];
}

/** Map Anthropic tool_use blocks to typed Candidate Actions (exactly-one invariant). */
export function parseToolUseToActions(content: unknown): ParsedAmbientAction[] {
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
