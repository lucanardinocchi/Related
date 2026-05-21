// Ambient Intelligence tool definitions — single source of truth for ClaudeAgent.
// Deno mirror: src/backend/supabase/functions/engaged-pass/ambientTools.ts — keep in sync.

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
      "One-line rationale visible on the card. Required when this candidate replaces a previous one with a different stance; otherwise optional.",
  },
};

export const AMBIENT_TOOLS: AmbientToolDefinition[] = [
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

/** DoNothing must always be a peer option — leaving a Relationship alone is a legitimate decision. */
export function ensureDoNothingPeer(
  actions: ParsedAmbientAction[],
): ParsedAmbientAction[] {
  if (!actions.some((a) => a.type === "DoNothing")) {
    return [...actions, { type: "DoNothing", payload: {} }];
  }
  return actions;
}
