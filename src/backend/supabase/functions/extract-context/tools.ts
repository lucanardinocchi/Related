export const EXTRACTION_TOOLS = [
  {
    name: "log_note",
    description:
      "Log a free-form note on a Relationship — facts, impressions, things to remember. Use relationship_id from the directory.",
    input_schema: {
      type: "object",
      required: ["relationship_id", "content"],
      properties: {
        relationship_id: { type: "string" },
        content: {
          type: "string",
          description: "Note body (1–4 sentences).",
        },
        time: {
          type: "string",
          description:
            "ISO-8601 timestamp. Omit to use the Chat close time.",
        },
      },
    },
  },
  {
    name: "log_interaction",
    description:
      "Log a past or planned Interaction (meet-up, call, event) on a Contact or Group Relationship.",
    input_schema: {
      type: "object",
      required: ["relationship_id", "kind", "status"],
      properties: {
        relationship_id: { type: "string" },
        kind: {
          type: "string",
          description: "e.g. coffee, dinner, call, meeting, birthday.",
        },
        status: {
          type: "string",
          enum: ["planned", "occurred", "attended", "missed", "cancelled"],
        },
        time: {
          type: "string",
          description: "ISO-8601. Omit for Chat close time.",
        },
        notes: { type: "string" },
        category: {
          type: "string",
          enum: ["work", "meeting", "activity", "personal", "errands"],
        },
      },
    },
  },
  {
    name: "log_comms",
    description:
      "Log a message or call on a specific channel with a Contact or Group Relationship.",
    input_schema: {
      type: "object",
      required: ["relationship_id", "channel"],
      properties: {
        relationship_id: { type: "string" },
        channel: {
          type: "string",
          enum: [
            "whatsapp",
            "imessage",
            "email",
            "phone_call",
            "instagram_dm",
            "x_dm",
            "tiktok_dm",
          ],
        },
        time: {
          type: "string",
          description: "ISO-8601. Omit for Chat close time.",
        },
        notes: {
          type: "string",
          description: "What was said or summarised content.",
        },
      },
    },
  },
  {
    name: "open_commitment",
    description:
      "Open a commitment (Open Thread) linked to one or more Relationships. Use for owed replies, plans, unresolved items.",
    input_schema: {
      type: "object",
      required: ["relationship_ids", "description", "direction"],
      properties: {
        relationship_ids: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
        },
        description: { type: "string" },
        direction: {
          type: "string",
          enum: ["me_owes_them", "they_owe_me"],
        },
        origin: {
          type: "string",
          enum: ["asked_of_me", "self_led"],
          description: "Meaningful when direction is me_owes_them.",
        },
        communication_status: {
          type: "string",
          enum: ["not_communicated", "confirmed"],
        },
      },
    },
  },
] as const;
