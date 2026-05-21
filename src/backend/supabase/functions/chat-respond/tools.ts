// Read-only tool surface for chat-respond. Per ADR-0009 Q7 — none of
// these mutate state; every effect on the world still passes through a
// Candidate Action surfaced by Ambient Intelligence.

// deno-lint-ignore-file no-explicit-any
import {
  buildGroupByIdQuery,
  buildGroupsListQuery,
  buildInteractionsListQuery,
  buildOpenThreadsListQuery,
  buildRelationshipByIdQuery,
  buildRelationshipsListQuery,
  fetchUserContextForTool,
  filterInteractionsByContact,
  filterOpenThreadsByRelationship,
} from "./queries.ts";
import type { ToolContext } from "./types.ts";

export const TOOLS = [
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

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (name) {
    case "list_relationships": {
      const { data, error } = await buildRelationshipsListQuery(
        ctx.supabase,
        input.target_type as string | undefined,
      );
      if (error) throw error;
      return data;
    }
    case "get_relationship": {
      const { data, error } = await buildRelationshipByIdQuery(
        ctx.supabase,
        input.relationship_id as string,
      );
      if (error) throw error;
      return data;
    }
    case "list_contacts": {
      const { data, error } = await ctx.supabase
        .from("contacts")
        .select(
          "id, name, phone, email, birthday, area, occupation, education, created_at",
        )
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    }
    case "get_contact": {
      const { data, error } = await ctx.supabase
        .from("contacts")
        .select(
          "id, name, phone, email, birthday, area, occupation, education, created_at",
        )
        .eq("id", input.contact_id as string)
        .single();
      if (error) throw error;
      return data;
    }
    case "list_open_threads": {
      const relationshipId = input.relationship_id as string | undefined;
      const { data, error } = await buildOpenThreadsListQuery(ctx.supabase, {
        includeClosed: !!input.include_closed,
        direction: input.direction as string | undefined,
      });
      if (error) throw error;

      const rows = data ?? [];
      if (relationshipId) {
        return filterOpenThreadsByRelationship(rows, relationshipId);
      }
      return rows;
    }
    case "list_interactions": {
      const { data, error } = await buildInteractionsListQuery(ctx.supabase, {
        status: input.status as string | undefined,
        since: input.since as string | undefined,
        until: input.until as string | undefined,
      });
      if (error) throw error;

      const rows = data ?? [];
      const contactId = input.contact_id as string | undefined;
      if (contactId) {
        return filterInteractionsByContact(rows, contactId);
      }
      return rows;
    }
    case "list_calendar_events": {
      let q = ctx.supabase
        .from("events")
        .select(
          "id, title, start, end, source, status, type, aim, required_prep, location, is_all_day, external_event_id",
        )
        .order("start", { ascending: true })
        .limit(200);
      if (input.since) q = q.gte("start", input.since as string);
      if (input.until) q = q.lte("start", input.until as string);
      const { data, error } = await q;
      if (error) {
        // Table may be unmigrated for some tenants; degrade gracefully.
        return { error: error.message, events: [] };
      }
      return data;
    }
    case "list_groups": {
      const { data, error } = await buildGroupsListQuery(ctx.supabase);
      if (error) throw error;
      return data;
    }
    case "get_group": {
      const { data, error } = await buildGroupByIdQuery(
        ctx.supabase,
        input.group_id as string,
      );
      if (error) throw error;
      return data;
    }
    case "get_user_context": {
      return fetchUserContextForTool(ctx.supabase);
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
