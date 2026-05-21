// Read-only tool surface for chat-respond. Per ADR-0009 Q7 — none of
// these mutate state; every effect on the world still passes through a
// Candidate Action surfaced by Ambient Intelligence.

// deno-lint-ignore-file no-explicit-any
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
      "List external Google Calendar events the agent has synced into inferred_signal_calendar. Read-only mirror; this is the Calendar density signal.",
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
      const targetType = input.target_type as string | undefined;
      let q = ctx.supabase
        .from("relationships")
        .select(
          "id, target_type, role, cadence, created_at, contact:contacts!target_contact_id(id, name, phone, email, birthday, area, occupation, education), group_target:groups!target_group_id(id, name)",
        )
        .order("created_at", { ascending: false });
      if (targetType && targetType !== "all") q = q.eq("target_type", targetType);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    }
    case "get_relationship": {
      const { data, error } = await ctx.supabase
        .from("relationships")
        .select(
          "id, target_type, role, cadence, created_at, contact:contacts!target_contact_id(id, name, phone, email, birthday, area, occupation, education), group_target:groups!target_group_id(id, name)",
        )
        .eq("id", input.relationship_id as string)
        .single();
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
      const includeClosed = !!input.include_closed;
      const direction = input.direction as string | undefined;
      const relationshipId = input.relationship_id as string | undefined;

      let q = ctx.supabase
        .from("open_threads")
        .select(
          "id, description, direction, origin, communication_status, created_at, closed_at, open_thread_relationships(relationship_id)",
        )
        .order("created_at", { ascending: false });
      if (!includeClosed) q = q.is("closed_at", null);
      if (direction) q = q.eq("direction", direction);

      const { data, error } = await q;
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        id: string;
        open_thread_relationships?: { relationship_id: string }[];
        [k: string]: unknown;
      }>;

      if (relationshipId) {
        return rows.filter((r) =>
          (r.open_thread_relationships ?? []).some(
            (l) => l.relationship_id === relationshipId,
          ),
        );
      }
      return rows;
    }
    case "list_interactions": {
      let q = ctx.supabase
        .from("interactions")
        .select(
          "id, time, kind, notes, status, interaction_contacts(contact_id, contacts(name))",
        )
        .order("time", { ascending: false })
        .limit(200);
      if (input.status)
        q = q.eq("status", input.status as string);
      if (input.since)
        q = q.gte("time", input.since as string);
      if (input.until)
        q = q.lte("time", input.until as string);
      const { data, error } = await q;
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        id: string;
        interaction_contacts?: { contact_id: string }[];
        [k: string]: unknown;
      }>;
      const contactId = input.contact_id as string | undefined;
      if (contactId) {
        return rows.filter((r) =>
          (r.interaction_contacts ?? []).some(
            (l) => l.contact_id === contactId,
          ),
        );
      }
      return rows;
    }
    case "list_calendar_events": {
      let q = ctx.supabase
        .from("inferred_signal_calendar")
        .select("id, summary, start_at, end_at, source")
        .order("start_at", { ascending: true })
        .limit(200);
      if (input.since) q = q.gte("start_at", input.since as string);
      if (input.until) q = q.lte("start_at", input.until as string);
      const { data, error } = await q;
      if (error) {
        // Table may be unmigrated for some tenants; degrade gracefully.
        return { error: error.message, events: [] };
      }
      return data;
    }
    case "list_groups": {
      const { data, error } = await ctx.supabase
        .from("groups")
        .select("id, name, created_at")
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    }
    case "get_group": {
      const { data, error } = await ctx.supabase
        .from("groups")
        .select(
          "id, name, created_at, contact_groups(contact_id, contacts(id, name))",
        )
        .eq("id", input.group_id as string)
        .single();
      if (error) throw error;
      return data;
    }
    case "get_user_context": {
      const goalsP = ctx.supabase
        .from("goals_and_values")
        .select("id, content, created_at, updated_at")
        .order("created_at", { ascending: false });
      const ssP = ctx.supabase
        .from("situational_state")
        .select("id, content, updated_at")
        .maybeSingle();
      const tiP = ctx.supabase
        .from("transient_intent")
        .select("id, content, captured_at, expires_at, relationship_id")
        .gt("expires_at", new Date().toISOString())
        .order("captured_at", { ascending: false })
        .limit(20);

      const [goals, ss, ti] = await Promise.all([goalsP, ssP, tiP]);
      if (goals.error) throw goals.error;
      if (ss.error) throw ss.error;
      if (ti.error) throw ti.error;

      return {
        goals_and_values: goals.data ?? [],
        situational_state: ss.data ?? null,
        transient_intent: ti.data ?? [],
      };
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
