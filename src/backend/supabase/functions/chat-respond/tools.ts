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
import { CONVERSATIONAL_TOOLS } from "../../../../shared/src/conversational/tools.ts";
import type { ToolContext } from "./types.ts";

export { CONVERSATIONAL_TOOLS as TOOLS };

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
