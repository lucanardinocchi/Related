import type { SupabaseClient } from "@supabase/supabase-js";
import type { DecisionState, PassMode } from "../candidates/candidateSet";
import type { CommsTimelineItem } from "../comms/relationshipCommsTimeline.ts";
import {
  fromCommsPlatformMessage,
  fromInstagramRow,
  fromTikTokRow,
  fromWhatsAppRow,
  fromXRow,
  mergeCommsTimelineItems,
} from "../comms/relationshipCommsTimeline.ts";
import type { Event, EventStatus, EventType, EventSource } from "../events/EventsClient";
import {
  inferCandidateExecuted,
  type CandidateExecutionContext,
} from "./inferCandidateExecution.ts";
import type { RelationshipContextSnapshot } from "./RelationshipContextBuilder.ts";

const EVENT_SELECT =
  "id, title, start, end, is_all_day, location, aim, required_prep, status, type, source, external_event_id, event_attendees(contact_id, contacts(name))";

interface EventRow {
  id: string;
  title: string | null;
  start: string;
  end: string;
  is_all_day: boolean;
  location: string | null;
  aim: string | null;
  required_prep: string | null;
  status: EventStatus;
  type: EventType;
  source: EventSource;
  external_event_id: string | null;
  event_attendees: {
    contact_id: string;
    contacts: { name: string } | null;
  }[];
}

function toEvent(row: EventRow): Event {
  return {
    id: row.id,
    title: row.title,
    start: row.start,
    end: row.end,
    isAllDay: row.is_all_day,
    location: row.location,
    aim: row.aim,
    requiredPrep: row.required_prep,
    status: row.status,
    type: row.type,
    source: row.source,
    externalEventId: row.external_event_id,
    attendees: (row.event_attendees ?? []).map((link) => ({
      id: link.contact_id,
      name: link.contacts?.name ?? "",
    })),
  };
}

export interface RelationshipContextEvent {
  id: string;
  title: string | null;
  start: string;
  end: string;
  isAllDay: boolean;
  location: string | null;
  aim: string | null;
  requiredPrep: string | null;
  status: EventStatus;
  type: EventType;
  source: EventSource;
  attendees: { id: string; name: string }[];
}

export interface SuggestedActionHistoryEntry {
  candidateSetId: string;
  passMode: PassMode;
  passCreatedAt: string;
  actionId: string;
  type: string;
  payload: unknown;
  why: string | null;
  decisionState: DecisionState;
  decidedAt: string | null;
  /** User picked this suggestion (declined / ignored / pending = false). */
  approved: boolean;
  /** When approved: whether the effect is observable in state; null otherwise. */
  executed: boolean | null;
}

export async function loadCommsForContact(
  supabase: SupabaseClient,
  contactId: string,
): Promise<CommsTimelineItem[]> {
  const [
    platform,
    instagram,
    whatsapp,
    x,
    tiktok,
    imessage,
  ] = await Promise.all([
    supabase
      .from("comms_platform_messages")
      .select(
        "platform, external_id, direction, body, subject, snippet, sent_at",
      )
      .eq("contact_id", contactId)
      .order("sent_at", { ascending: false }),
    supabase
      .from("instagram_messages")
      .select("ig_message_id, direction, text, sent_at")
      .eq("contact_id", contactId)
      .order("sent_at", { ascending: false }),
    supabase
      .from("whatsapp_messages")
      .select("wa_message_id, direction, text, sent_at")
      .eq("contact_id", contactId)
      .order("sent_at", { ascending: false }),
    supabase
      .from("x_messages")
      .select("x_message_id, direction, text, sent_at")
      .eq("contact_id", contactId)
      .order("sent_at", { ascending: false }),
    supabase
      .from("tiktok_messages")
      .select("tiktok_message_id, direction, text, sent_at")
      .eq("contact_id", contactId)
      .order("sent_at", { ascending: false }),
    loadImessageForContact(supabase, contactId),
  ]);

  const collected: CommsTimelineItem[] = [];
  if (platform.data) {
    collected.push(
      ...platform.data.map((row) => fromCommsPlatformMessage(row)),
    );
  }
  if (instagram.data) {
    collected.push(...instagram.data.map((row) => fromInstagramRow(row)));
  }
  if (whatsapp.data) {
    collected.push(...whatsapp.data.map((row) => fromWhatsAppRow(row)));
  }
  if (x.data) collected.push(...x.data.map((row) => fromXRow(row)));
  if (tiktok.data) {
    collected.push(...tiktok.data.map((row) => fromTikTokRow(row)));
  }
  collected.push(...imessage);

  return mergeCommsTimelineItems(collected);
}

async function loadImessageForContact(
  supabase: SupabaseClient,
  contactId: string,
): Promise<CommsTimelineItem[]> {
  const { data: threads, error: threadErr } = await supabase
    .from("message_threads")
    .select("id")
    .eq("contact_id", contactId);
  if (threadErr || !threads?.length) return [];

  const threadIds = (threads as { id: string }[]).map((t) => t.id);
  const { data: messages, error: msgErr } = await supabase
    .from("messages")
    .select("id, direction, body, sent_at")
    .in("thread_id", threadIds)
    .order("sent_at", { ascending: false });
  if (msgErr || !messages) return [];

  return (messages as Array<{
    id: string;
    direction: string;
    body: string;
    sent_at: string;
  }>).map((m) => ({
    id: `imessage:${m.id}`,
    platform: "imessage" as const,
    direction: m.direction === "outbound" ? ("sent" as const) : ("received" as const),
    sentAt: m.sent_at,
    body: m.body,
  }));
}

export async function loadCommsForGroup(
  supabase: SupabaseClient,
  groupId: string,
  memberContactIds: string[],
): Promise<CommsTimelineItem[]> {
  const collected: CommsTimelineItem[] = [];
  const seen = new Set<string>();

  function addItems(next: CommsTimelineItem[]) {
    for (const item of next) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      collected.push(item);
    }
  }

  const [wa, tt, x, imessage, ...perContact] = await Promise.all([
    supabase
      .from("whatsapp_messages")
      .select("wa_message_id, direction, text, sent_at")
      .eq("group_id", groupId)
      .order("sent_at", { ascending: false }),
    supabase
      .from("tiktok_messages")
      .select("tiktok_message_id, direction, text, sent_at")
      .eq("group_id", groupId)
      .order("sent_at", { ascending: false }),
    supabase
      .from("x_messages")
      .select("x_message_id, direction, text, sent_at")
      .eq("group_id", groupId)
      .order("sent_at", { ascending: false }),
    loadImessageForGroup(supabase, groupId),
    ...memberContactIds.map((id) => loadCommsForContact(supabase, id)),
  ]);

  if (wa.data) addItems(wa.data.map((row) => fromWhatsAppRow(row)));
  if (tt.data) addItems(tt.data.map((row) => fromTikTokRow(row)));
  if (x.data) addItems(x.data.map((row) => fromXRow(row)));
  addItems(imessage);
  for (const list of perContact) addItems(list);

  return mergeCommsTimelineItems(collected);
}

async function loadImessageForGroup(
  supabase: SupabaseClient,
  groupId: string,
): Promise<CommsTimelineItem[]> {
  const { data: threads, error: threadErr } = await supabase
    .from("message_threads")
    .select("id")
    .eq("group_id", groupId);
  if (threadErr || !threads?.length) return [];

  const threadIds = (threads as { id: string }[]).map((t) => t.id);
  const { data: messages, error: msgErr } = await supabase
    .from("messages")
    .select("id, direction, body, sent_at")
    .in("thread_id", threadIds)
    .order("sent_at", { ascending: false });
  if (msgErr || !messages) return [];

  return (messages as Array<{
    id: string;
    direction: string;
    body: string;
    sent_at: string;
  }>).map((m) => ({
    id: `imessage:${m.id}`,
    platform: "imessage" as const,
    direction: m.direction === "outbound" ? ("sent" as const) : ("received" as const),
    sentAt: m.sent_at,
    body: m.body,
  }));
}

export async function loadEventsForContactIds(
  supabase: SupabaseClient,
  contactIds: string[],
): Promise<RelationshipContextEvent[]> {
  if (contactIds.length === 0) return [];

  const { data: links, error: linkErr } = await supabase
    .from("event_attendees")
    .select("event_id")
    .in("contact_id", contactIds);
  if (linkErr) throw linkErr;

  const eventIds = [
    ...new Set(((links ?? []) as { event_id: string }[]).map((l) => l.event_id)),
  ];
  if (eventIds.length === 0) return [];

  const { data, error } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .in("id", eventIds)
    .order("start", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as unknown as EventRow[]).map((row) => {
    const e = toEvent(row);
    return {
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      isAllDay: e.isAllDay,
      location: e.location,
      aim: e.aim,
      requiredPrep: e.requiredPrep,
      status: e.status,
      type: e.type,
      source: e.source,
      attendees: e.attendees,
    };
  });
}

export async function loadSuggestedActionHistory(
  supabase: SupabaseClient,
  relationshipId: string,
  executionContext: CandidateExecutionContext,
): Promise<SuggestedActionHistoryEntry[]> {
  const { data: sets, error: setErr } = await supabase
    .from("candidate_sets")
    .select(
      "id, mode, created_at, candidate_actions(id, type, payload, why, decision_state, decided_at)",
    )
    .eq("relationship_id", relationshipId)
    .order("created_at", { ascending: true });
  if (setErr) throw setErr;

  const history: SuggestedActionHistoryEntry[] = [];

  for (const set of (sets ?? []) as Array<{
    id: string;
    mode: PassMode;
    created_at: string;
    candidate_actions?: Array<{
      id: string;
      type: string;
      payload: unknown;
      why: string | null;
      decision_state: DecisionState;
      decided_at: string | null;
    }>;
  }>) {
    for (const action of set.candidate_actions ?? []) {
      const approved = action.decision_state === "picked";
      history.push({
        candidateSetId: set.id,
        passMode: set.mode,
        passCreatedAt: set.created_at,
        actionId: action.id,
        type: action.type,
        payload: action.payload,
        why: action.why,
        decisionState: action.decision_state,
        decidedAt: action.decided_at,
        approved,
        executed: inferCandidateExecuted(
          action.type,
          action.payload,
          action.decision_state,
          action.decided_at,
          executionContext,
        ),
      });
    }
  }

  return history;
}

export async function loadRelationshipAmbientExtras(
  supabase: SupabaseClient,
  snapshot: RelationshipContextSnapshot,
  relationshipId: string,
): Promise<{
  platformComms: CommsTimelineItem[];
  calendarEvents: RelationshipContextEvent[];
  suggestedActionHistory: SuggestedActionHistoryEntry[];
}> {
  const executionContext: CandidateExecutionContext = {
    relationship: snapshot.relationship,
    interactions: snapshot.interactions,
    openThreads: snapshot.openThreads,
  };

  const rel = snapshot.relationship;
  let platformComms: CommsTimelineItem[] = [];
  let contactIds: string[] = [];

  if (rel.target_type === "contact" && rel.target_contact_id) {
    contactIds = [rel.target_contact_id];
    platformComms = await loadCommsForContact(supabase, rel.target_contact_id);
  } else if (rel.target_type === "group" && rel.target_group_id) {
    contactIds = snapshot.groupMembers.map((m) => m.contact_id);
    platformComms = await loadCommsForGroup(
      supabase,
      rel.target_group_id,
      contactIds,
    );
  }

  const [calendarEvents, suggestedActionHistory] = await Promise.all([
    loadEventsForContactIds(supabase, contactIds),
    loadSuggestedActionHistory(supabase, relationshipId, executionContext),
  ]);

  return { platformComms, calendarEvents, suggestedActionHistory };
}
