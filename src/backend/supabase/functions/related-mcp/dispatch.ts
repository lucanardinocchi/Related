// MCP tool dispatcher — read tools (Conversational surface) plus writes for
// interactions, events, and commitments.
//
// deno-lint-ignore-file no-explicit-any

import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
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
} from "../chat-respond/queries.ts";

export interface McpToolContext {
  supabase: SupabaseClient;
  ownerId: string;
}

async function assertOwnedRow(
  supabase: SupabaseClient,
  table: string,
  id: string,
  ownerId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`${table} not found`);
}

async function assertOwnedRelationships(
  supabase: SupabaseClient,
  relationshipIds: string[],
  ownerId: string,
): Promise<void> {
  for (const relId of relationshipIds) {
    const { data, error } = await supabase
      .from("relationships")
      .select("id")
      .eq("id", relId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`relationship not found: ${relId}`);
  }
}

async function assertOwnedContacts(
  supabase: SupabaseClient,
  contactIds: string[],
  ownerId: string,
): Promise<void> {
  if (contactIds.length === 0) return;
  const { data, error } = await supabase
    .from("contacts")
    .select("id")
    .eq("owner_id", ownerId)
    .in("id", contactIds);
  if (error) throw error;
  if ((data ?? []).length !== contactIds.length) {
    throw new Error("one or more contacts not found");
  }
}

async function createInteractionRecord(
  ctx: McpToolContext,
  input: {
    time: string;
    kind: string;
    notes: string | null;
    status: string;
    contactIds: string[];
    groupId?: string | null;
    category?: string;
  },
): Promise<string> {
  const { supabase, ownerId } = ctx;
  const groupId = input.groupId ?? null;
  const contactIds = input.contactIds ?? [];

  if (!groupId && contactIds.length === 0) {
    throw new Error("at least one contact required");
  }

  if (groupId) {
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .select("id")
      .eq("id", groupId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (groupError) throw groupError;
    if (!group) throw new Error("group not found");
  }

  await assertOwnedContacts(supabase, contactIds, ownerId);

  const { data: row, error } = await supabase
    .from("interactions")
    .insert({
      owner_id: ownerId,
      time: input.time,
      kind: input.kind,
      notes: input.notes,
      status: input.status,
      group_id: groupId,
      category: input.category ?? "personal",
      capture_source: "manual",
    })
    .select("id")
    .single();
  if (error) throw error;

  const interactionId = row.id as string;

  if (contactIds.length > 0) {
    const { error: linkError } = await supabase.from("interaction_contacts").insert(
      contactIds.map((contactId) => ({
        interaction_id: interactionId,
        contact_id: contactId,
        owner_id: ownerId,
      })),
    );
    if (linkError) throw linkError;
  }

  if (groupId) {
    const { data: members, error: membersError } = await supabase
      .from("contact_groups")
      .select("contact_id")
      .eq("group_id", groupId)
      .eq("owner_id", ownerId);
    if (membersError) throw membersError;

    const memberIds = (members ?? []).map((m: { contact_id: string }) =>
      m.contact_id
    );
    const existing = new Set(contactIds);
    const membersToAdd = memberIds.filter((id: string) => !existing.has(id));
    if (membersToAdd.length > 0) {
      const { error: memberLinkError } = await supabase
        .from("interaction_contacts")
        .insert(
          membersToAdd.map((contactId: string) => ({
            interaction_id: interactionId,
            contact_id: contactId,
            owner_id: ownerId,
          })),
        );
      if (memberLinkError) throw memberLinkError;
    }

    const { count, error: countError } = await supabase
      .from("interaction_contacts")
      .select("contact_id", { count: "exact", head: true })
      .eq("interaction_id", interactionId);
    if (countError) throw countError;
    if (!count) {
      await supabase.from("interactions").delete().eq("id", interactionId);
      throw new Error("group has no current members; nothing to link");
    }
  }

  return interactionId;
}

export async function dispatchMcpTool(
  name: string,
  input: Record<string, unknown>,
  ctx: McpToolContext,
): Promise<unknown> {
  const { supabase, ownerId } = ctx;

  switch (name) {
    case "list_relationships": {
      let q = buildRelationshipsListQuery(
        supabase,
        input.target_type as string | undefined,
      ).eq("owner_id", ownerId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    }
    case "get_relationship": {
      const { data, error } = await buildRelationshipByIdQuery(
        supabase,
        input.relationship_id as string,
      )
        .eq("owner_id", ownerId)
        .single();
      if (error) throw error;
      return data;
    }
    case "list_contacts": {
      const { data, error } = await supabase
        .from("contacts")
        .select(
          "id, name, phone, email, birthday, area, occupation, education, created_at",
        )
        .eq("owner_id", ownerId)
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    }
    case "get_contact": {
      const { data, error } = await supabase
        .from("contacts")
        .select(
          "id, name, phone, email, birthday, area, occupation, education, created_at",
        )
        .eq("owner_id", ownerId)
        .eq("id", input.contact_id as string)
        .single();
      if (error) throw error;
      return data;
    }
    case "list_open_threads": {
      const relationshipId = input.relationship_id as string | undefined;
      let q = buildOpenThreadsListQuery(supabase, {
        includeClosed: !!input.include_closed,
        direction: input.direction as string | undefined,
      }).eq("owner_id", ownerId);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      if (relationshipId) {
        return filterOpenThreadsByRelationship(rows, relationshipId);
      }
      return rows;
    }
    case "list_interactions": {
      let q = buildInteractionsListQuery(supabase, {
        status: input.status as string | undefined,
        since: input.since as string | undefined,
        until: input.until as string | undefined,
      }).eq("owner_id", ownerId);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      const contactId = input.contact_id as string | undefined;
      if (contactId) {
        return filterInteractionsByContact(rows, contactId);
      }
      return rows;
    }
    case "list_calendar_events": {
      let q = supabase
        .from("events")
        .select(
          "id, title, start, end, source, status, type, aim, required_prep, location, is_all_day, external_event_id",
        )
        .eq("owner_id", ownerId)
        .order("start", { ascending: true })
        .limit(200);
      if (input.since) q = q.gte("start", input.since as string);
      if (input.until) q = q.lte("start", input.until as string);
      const { data, error } = await q;
      if (error) return { error: error.message, events: [] };
      return data;
    }
    case "list_groups": {
      const { data, error } = await buildGroupsListQuery(supabase).eq(
        "owner_id",
        ownerId,
      );
      if (error) throw error;
      return data;
    }
    case "get_group": {
      const { data, error } = await buildGroupByIdQuery(
        supabase,
        input.group_id as string,
      )
        .eq("owner_id", ownerId)
        .single();
      if (error) throw error;
      return data;
    }
    case "get_user_context": {
      const scoped = createClientWithOwnerFilter(supabase, ownerId);
      return fetchUserContextForTool(scoped);
    }

    case "create_interaction": {
      const contactIds = (input.contact_ids as string[]) ?? [];
      const id = await createInteractionRecord(ctx, {
        time: input.time as string,
        kind: input.kind as string,
        notes: (input.notes as string | undefined)?.trim() || null,
        status: input.status as string,
        contactIds,
        groupId: (input.group_id as string | undefined) ?? null,
        category: (input.category as string | undefined) ?? "personal",
      });
      return { ok: true, interaction_id: id };
    }
    case "update_interaction": {
      const interactionId = input.interaction_id as string;
      await assertOwnedRow(supabase, "interactions", interactionId, ownerId);
      const patch: Record<string, unknown> = {};
      if (input.time !== undefined) patch.time = input.time;
      if (input.kind !== undefined) patch.kind = input.kind;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.status !== undefined) patch.status = input.status;
      if (input.category !== undefined) patch.category = input.category;
      const { data, error } = await supabase
        .from("interactions")
        .update(patch)
        .eq("id", interactionId)
        .eq("owner_id", ownerId)
        .select("id, time, kind, status, notes, category")
        .single();
      if (error) throw error;
      return { ok: true, interaction: data };
    }
    case "delete_interaction": {
      const interactionId = input.interaction_id as string;
      await assertOwnedRow(supabase, "interactions", interactionId, ownerId);
      const { error } = await supabase
        .from("interactions")
        .delete()
        .eq("id", interactionId)
        .eq("owner_id", ownerId);
      if (error) throw error;
      return { ok: true };
    }

    case "create_event": {
      const contactIds = (input.contact_ids as string[] | undefined) ?? [];
      await assertOwnedContacts(supabase, contactIds, ownerId);
      const { data, error } = await supabase
        .from("events")
        .insert({
          owner_id: ownerId,
          title: (input.title as string | undefined) ?? null,
          start: input.start as string,
          end: input.end as string,
          is_all_day: !!input.is_all_day,
          location: (input.location as string | undefined) ?? null,
          aim: (input.aim as string | undefined) ?? null,
          required_prep: (input.required_prep as string | undefined) ?? null,
          status: (input.status as string | undefined) ?? "planned",
          type: (input.type as string | undefined) ?? "meeting",
          source: "manual",
        })
        .select("id")
        .single();
      if (error) throw error;
      const eventId = data.id as string;
      if (contactIds.length > 0) {
        const { error: attendeeError } = await supabase
          .from("event_attendees")
          .insert(
            contactIds.map((contactId) => ({
              event_id: eventId,
              contact_id: contactId,
            })),
          );
        if (attendeeError) throw attendeeError;
      }
      return { ok: true, event_id: eventId };
    }
    case "update_event": {
      const eventId = input.event_id as string;
      await assertOwnedRow(supabase, "events", eventId, ownerId);
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (input.title !== undefined) patch.title = input.title;
      if (input.start !== undefined) patch.start = input.start;
      if (input.end !== undefined) patch.end = input.end;
      if (input.is_all_day !== undefined) patch.is_all_day = input.is_all_day;
      if (input.location !== undefined) patch.location = input.location;
      if (input.aim !== undefined) patch.aim = input.aim;
      if (input.required_prep !== undefined) {
        patch.required_prep = input.required_prep;
      }
      if (input.status !== undefined) patch.status = input.status;
      if (input.type !== undefined) patch.type = input.type;
      const { data, error } = await supabase
        .from("events")
        .update(patch)
        .eq("id", eventId)
        .eq("owner_id", ownerId)
        .select("id, title, start, end, source, status, type")
        .single();
      if (error) throw error;

      if (Array.isArray(input.contact_ids)) {
        const contactIds = input.contact_ids as string[];
        await assertOwnedContacts(supabase, contactIds, ownerId);
        await supabase.from("event_attendees").delete().eq("event_id", eventId);
        if (contactIds.length > 0) {
          const { error: attendeeError } = await supabase
            .from("event_attendees")
            .insert(
              contactIds.map((contactId) => ({
                event_id: eventId,
                contact_id: contactId,
              })),
            );
          if (attendeeError) throw attendeeError;
        }
      }

      return { ok: true, event: data };
    }
    case "delete_event": {
      const eventId = input.event_id as string;
      const { data: event, error: fetchError } = await supabase
        .from("events")
        .select("id, source")
        .eq("id", eventId)
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!event) throw new Error("event not found");
      if (event.source !== "manual") {
        throw new Error("only manual events can be deleted via MCP");
      }
      const { error } = await supabase
        .from("events")
        .delete()
        .eq("id", eventId)
        .eq("owner_id", ownerId);
      if (error) throw error;
      return { ok: true };
    }

    case "create_commitment": {
      const relationshipIds = input.relationship_ids as string[];
      const description = (input.description as string)?.trim();
      const direction = input.direction as string;
      if (
        !Array.isArray(relationshipIds) ||
        relationshipIds.length === 0 ||
        !description ||
        !direction
      ) {
        throw new Error("relationship_ids, description, and direction required");
      }
      await assertOwnedRelationships(supabase, relationshipIds, ownerId);

      const origin =
        direction === "me_owes_them"
          ? ((input.origin as string | undefined) ?? "self_led")
          : null;
      const communicationStatus =
        (input.communication_status as string | undefined) ??
        "not_communicated";

      const { data: thread, error } = await supabase
        .from("open_threads")
        .insert({
          owner_id: ownerId,
          description,
          direction,
          origin,
          communication_status: communicationStatus,
          capture_source: "manual",
        })
        .select("id")
        .single();
      if (error) throw error;

      const openThreadId = thread.id as string;
      const { error: linkError } = await supabase
        .from("open_thread_relationships")
        .insert(
          relationshipIds.map((relationshipId) => ({
            open_thread_id: openThreadId,
            relationship_id: relationshipId,
            owner_id: ownerId,
          })),
        );
      if (linkError) throw linkError;

      return { ok: true, open_thread_id: openThreadId };
    }
    case "update_commitment": {
      const openThreadId = input.open_thread_id as string;
      await assertOwnedRow(supabase, "open_threads", openThreadId, ownerId);
      const patch: Record<string, unknown> = {};
      if (input.description !== undefined) patch.description = input.description;
      if (input.origin !== undefined) patch.origin = input.origin;
      if (input.communication_status !== undefined) {
        patch.communication_status = input.communication_status;
      }
      if (input.why_helps_person !== undefined) {
        patch.why_helps_person = input.why_helps_person;
      }
      if (input.why_i_can_help !== undefined) {
        patch.why_i_can_help = input.why_i_can_help;
      }
      const { data, error } = await supabase
        .from("open_threads")
        .update(patch)
        .eq("id", openThreadId)
        .eq("owner_id", ownerId)
        .select("id, description, direction, origin, communication_status, closed_at")
        .single();
      if (error) throw error;
      return { ok: true, commitment: data };
    }
    case "close_commitment": {
      const openThreadId = input.open_thread_id as string;
      await assertOwnedRow(supabase, "open_threads", openThreadId, ownerId);
      const { data, error } = await supabase
        .from("open_threads")
        .update({ closed_at: new Date().toISOString() })
        .eq("id", openThreadId)
        .eq("owner_id", ownerId)
        .select("id, closed_at")
        .single();
      if (error) throw error;
      return { ok: true, commitment: data };
    }

    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

/** Scope user-context reads to one owner when using the service role. */
function createClientWithOwnerFilter(
  supabase: SupabaseClient,
  ownerId: string,
): SupabaseClient {
  const tablesWithOwner = new Set([
    "goals_and_values",
    "transient_intent",
    "situational_state",
    "inferred_signal_calendar",
    "inferred_signal_sleep",
  ]);

  return new Proxy(supabase, {
    get(target, prop, receiver) {
      if (prop !== "from") {
        return Reflect.get(target, prop, receiver);
      }
      return (table: string) => {
        const query = target.from(table);
        if (tablesWithOwner.has(table)) {
          return query.eq("owner_id", ownerId);
        }
        return query;
      };
    },
  }) as SupabaseClient;
}
