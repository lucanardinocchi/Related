import { CONVERSATIONAL_TOOLS } from "../conversational/tools.ts";

const MCP_WRITE_TOOLS = [
  {
    name: "create_interaction",
    description:
      "Log or plan an Interaction (call, coffee, catch-up, etc.) for one or more Contacts, optionally in Group mode.",
    input_schema: {
      type: "object",
      required: ["time", "kind", "status", "contact_ids"],
      properties: {
        time: { type: "string", description: "ISO-8601 timestamp." },
        kind: {
          type: "string",
          description: "e.g. coffee, dinner, call, birthday, catch-up.",
        },
        status: {
          type: "string",
          enum: ["planned", "occurred", "attended", "missed", "cancelled"],
        },
        contact_ids: {
          type: "array",
          items: { type: "string" },
          description: "Contact ids on the Interaction. Required unless group_id is set.",
        },
        group_id: {
          type: "string",
          description:
            "Optional Group id for explicit group-mode logging (touches all current members).",
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
    name: "update_interaction",
    description: "Update an existing Interaction owned by the User.",
    input_schema: {
      type: "object",
      required: ["interaction_id"],
      properties: {
        interaction_id: { type: "string" },
        time: { type: "string" },
        kind: { type: "string" },
        status: {
          type: "string",
          enum: ["planned", "occurred", "attended", "missed", "cancelled"],
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
    name: "delete_interaction",
    description: "Delete an Interaction owned by the User.",
    input_schema: {
      type: "object",
      required: ["interaction_id"],
      properties: { interaction_id: { type: "string" } },
    },
  },
  {
    name: "create_event",
    description:
      "Create a manual calendar Event in Related (source=manual). Google/Outlook sync is read-only here.",
    input_schema: {
      type: "object",
      required: ["start", "end"],
      properties: {
        title: { type: "string" },
        start: { type: "string", description: "ISO-8601 start." },
        end: { type: "string", description: "ISO-8601 end." },
        is_all_day: { type: "boolean" },
        location: { type: "string" },
        aim: { type: "string" },
        required_prep: { type: "string" },
        status: {
          type: "string",
          enum: ["planned", "occurred", "attended", "cancelled", "missed"],
        },
        type: {
          type: "string",
          enum: ["work", "meeting", "uni", "personal", "activity"],
        },
        contact_ids: {
          type: "array",
          items: { type: "string" },
          description: "Contacts attending this event.",
        },
      },
    },
  },
  {
    name: "update_event",
    description:
      "Update a calendar Event. User-owned enrichment fields can be edited on synced events too.",
    input_schema: {
      type: "object",
      required: ["event_id"],
      properties: {
        event_id: { type: "string" },
        title: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
        is_all_day: { type: "boolean" },
        location: { type: "string" },
        aim: { type: "string" },
        required_prep: { type: "string" },
        status: {
          type: "string",
          enum: ["planned", "occurred", "attended", "cancelled", "missed"],
        },
        type: {
          type: "string",
          enum: ["work", "meeting", "uni", "personal", "activity"],
        },
        contact_ids: {
          type: "array",
          items: { type: "string" },
          description: "Replace attendee set when provided.",
        },
      },
    },
  },
  {
    name: "delete_event",
    description:
      "Delete a manual calendar Event. Synced Google/Outlook events cannot be deleted via MCP.",
    input_schema: {
      type: "object",
      required: ["event_id"],
      properties: { event_id: { type: "string" } },
    },
  },
  {
    name: "create_commitment",
    description:
      "Open a commitment (Open Thread) linked to one or more Relationships.",
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
        },
        communication_status: {
          type: "string",
          enum: ["not_communicated", "confirmed"],
        },
      },
    },
  },
  {
    name: "update_commitment",
    description: "Update an open commitment's description or commitment metadata.",
    input_schema: {
      type: "object",
      required: ["open_thread_id"],
      properties: {
        open_thread_id: { type: "string" },
        description: { type: "string" },
        origin: {
          type: "string",
          enum: ["asked_of_me", "self_led"],
        },
        communication_status: {
          type: "string",
          enum: ["not_communicated", "confirmed"],
        },
        why_helps_person: { type: "string" },
        why_i_can_help: { type: "string" },
      },
    },
  },
  {
    name: "close_commitment",
    description: "Close a commitment by setting closed_at.",
    input_schema: {
      type: "object",
      required: ["open_thread_id"],
      properties: { open_thread_id: { type: "string" } },
    },
  },
] as const;

/** Full MCP tool surface: Conversational read tools plus MCP write tools. */
export const MCP_TOOLS = [...CONVERSATIONAL_TOOLS, ...MCP_WRITE_TOOLS];
