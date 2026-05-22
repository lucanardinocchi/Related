// Read-only tool surface for Conversational Intelligence.
// Per ADR-0009 Q7 — none of these mutate state; every effect on the
// world still passes through a Candidate Action surfaced by Ambient Intelligence.

export const CONVERSATIONAL_TOOLS = [
  {
    name: "list_relationships",
    description:
      "List all of the User's Relationships (the bond from User to a Contact or Group). Returns id, role, cadence, and the target Contact or Group's name + basic details. Use to enumerate the people in their world.",
    input_schema: {
      type: "object",
      properties: {
        target_type: {
          type: "string",
          enum: ["contact", "group", "all"],
          description: "Filter to Contact-targeted, Group-targeted, or all (default).",
        },
      },
    },
  },
  {
    name: "get_relationship",
    description:
      "Get one Relationship by id with the full Contact (or Group) profile attached.",
    input_schema: {
      type: "object",
      required: ["relationship_id"],
      properties: { relationship_id: { type: "string" } },
    },
  },
  {
    name: "list_contacts",
    description:
      "List all Contacts the User has stored. A Contact is a referenced person, not a Relationship — use list_relationships when you want bond context.",
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
    name: "list_open_threads",
    description:
      "List the User's Open Threads (commitments, owed replies, unresolved items). Optionally filter to threads attached to a specific Relationship, or to me_owes_them direction (Commitments view).",
    input_schema: {
      type: "object",
      properties: {
        relationship_id: { type: "string" },
        direction: {
          type: "string",
          enum: ["me_owes_them", "they_owe_me"],
        },
        include_closed: {
          type: "boolean",
          description: "Include closed threads (default false).",
        },
      },
    },
  },
  {
    name: "list_interactions",
    description:
      "List Interactions (logged or planned moments of contact). Optionally filter by contact, status, or time window.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        status: {
          type: "string",
          enum: ["planned", "occurred", "missed"],
        },
        since: { type: "string", description: "ISO timestamp lower bound." },
        until: { type: "string", description: "ISO timestamp upper bound." },
      },
    },
  },
  {
    name: "list_calendar_events",
    description:
      "List the User's calendar Events (manual entries and Google-synced rows from the unified events table). Includes user enrichment: aim, required prep, status, type.",
    input_schema: {
      type: "object",
      properties: {
        since: { type: "string" },
        until: { type: "string" },
      },
    },
  },
  {
    name: "list_groups",
    description: "List the User's Groups (named collections of Contacts).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_group",
    description: "Get a Group by id with member Contacts attached.",
    input_schema: {
      type: "object",
      required: ["group_id"],
      properties: { group_id: { type: "string" } },
    },
  },
  {
    name: "get_user_context",
    description:
      "Get the User's User Context — all four flavours: Goals & Values (User-authored), Situational State (current life context), recent Transient Intent (recent ephemeral intents from prior Chats), and Inferred Signals (Calendar density + Sleep summary, if present).",
    input_schema: { type: "object", properties: {} },
  },
] as const;

/** @deprecated Prefer CONVERSATIONAL_TOOLS — alias kept for call-site brevity. */
export const TOOLS = CONVERSATIONAL_TOOLS;
