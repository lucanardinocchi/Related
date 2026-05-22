import type { SupabaseClient } from "@supabase/supabase-js";
import type { RawCalendarEvent } from "./calendarDensity.ts";

/**
 * ADR-0010 dual-write contract. `sync-calendar` writes the same provider
 * snapshot to:
 *
 *   1. `inferred_signal_calendar` — agent Calendar density input only.
 *   2. `events` — user-facing /calendar surface (Google/Outlook rows).
 *
 * On `events` upsert, only GOOGLE_OWNED columns are in the payload so
 * USER_OWNED enrichment survives re-syncs.
 */
export const EVENTS_GOOGLE_OWNED_COLUMNS = [
  "title",
  "start",
  "end",
  "is_all_day",
  "location",
] as const;

export const EVENTS_USER_OWNED_COLUMNS = [
  "aim",
  "required_prep",
  "status",
  "type",
] as const;

export const OUTLOOK_EVENT_PREFIX = "outlook:";

export type CalendarSyncProvider = "google" | "outlook";

export interface CalendarSyncEvent {
  id: string;
  title?: string | null;
  start: string;
  end: string;
  isAllDay: boolean;
  location?: string | null;
  attendeeEmails?: string[];
}

export interface CalendarSignalRow {
  owner_id: string;
  event_id: string;
  title: string | null;
  start: string;
  end: string;
  is_all_day: boolean;
}

export interface CalendarEventsGoogleRow {
  owner_id: string;
  external_event_id: string;
  source: "google";
  title: string | null;
  start: string;
  end: string;
  is_all_day: boolean;
  location: string | null;
}

export interface CalendarEventsOutlookRow {
  owner_id: string;
  external_event_id: string;
  source: "outlook";
  title: string | null;
  start: string;
  end: string;
  is_all_day: boolean;
  location: string | null;
}

export type CalendarEventsProviderRow =
  | CalendarEventsGoogleRow
  | CalendarEventsOutlookRow;

export interface CalendarSyncPersistResult {
  status: "ok" | "error";
  error?: string;
}

export function toSignalRow(
  ownerId: string,
  event: RawCalendarEvent,
): CalendarSignalRow {
  return {
    owner_id: ownerId,
    event_id: event.id,
    title: event.title ?? null,
    start: event.start,
    end: event.end,
    is_all_day: event.isAllDay,
  };
}

export function toSignalRowForProvider(
  provider: CalendarSyncProvider,
  ownerId: string,
  event: CalendarSyncEvent,
): CalendarSignalRow {
  const row: CalendarSignalRow = {
    owner_id: ownerId,
    event_id: event.id,
    title: event.title ?? null,
    start: event.start,
    end: event.end,
    is_all_day: event.isAllDay,
  };
  if (provider === "outlook") {
    row.event_id = toOutlookSignalEventId(event.id);
  }
  return row;
}

export function toEventsGoogleRow(
  ownerId: string,
  event: CalendarSyncEvent,
): CalendarEventsGoogleRow {
  return {
    owner_id: ownerId,
    external_event_id: event.id,
    source: "google",
    title: event.title ?? null,
    start: event.start,
    end: event.end,
    is_all_day: event.isAllDay,
    location: event.location ?? null,
  };
}

export function toEventsOutlookRow(
  ownerId: string,
  event: CalendarSyncEvent,
): CalendarEventsOutlookRow {
  return {
    owner_id: ownerId,
    external_event_id: `${OUTLOOK_EVENT_PREFIX}${event.id}`,
    source: "outlook",
    title: event.title ?? null,
    start: event.start,
    end: event.end,
    is_all_day: event.isAllDay,
    location: event.location ?? null,
  };
}

export function toEventsRowForProvider(
  provider: CalendarSyncProvider,
  ownerId: string,
  event: CalendarSyncEvent,
): CalendarEventsProviderRow {
  return provider === "outlook"
    ? toEventsOutlookRow(ownerId, event)
    : toEventsGoogleRow(ownerId, event);
}

export function toOutlookSignalEventId(graphEventId: string): string {
  return `${OUTLOOK_EVENT_PREFIX}${graphEventId}`;
}

export function externalEventIdForProvider(
  provider: CalendarSyncProvider,
  eventId: string,
): string {
  return provider === "outlook"
    ? toOutlookSignalEventId(eventId)
    : eventId;
}

export function signalEventIdForProvider(
  provider: CalendarSyncProvider,
  eventId: string,
): string {
  return externalEventIdForProvider(provider, eventId);
}

export function eventsUpsertKeys(
  row: CalendarEventsProviderRow,
): string[] {
  return Object.keys(row);
}

export interface CalendarSyncPersistOptions {
  /** When set, prune only removes provider rows in this window (full sync). */
  window?: { timeMin: string; timeMax: string };
  /** When false, skip deleting provider rows missing from the snapshot (webhook upserts). */
  pruneMissing?: boolean;
}

export async function persistCalendarSyncSnapshot(
  supabase: SupabaseClient,
  provider: CalendarSyncProvider,
  ownerId: string,
  events: CalendarSyncEvent[],
  options: CalendarSyncPersistOptions = {},
): Promise<CalendarSyncPersistResult> {
  const pruneMissing = options.pruneMissing !== false;

  if (events.length > 0) {
    const signalRows = events.map((e) =>
      toSignalRowForProvider(provider, ownerId, e),
    );
    const { error: upErr } = await supabase
      .from("inferred_signal_calendar")
      .upsert(signalRows, { onConflict: "owner_id,event_id" });
    if (upErr) {
      return { status: "error", error: `upsert: ${upErr.message ?? String(upErr)}` };
    }

    const eventRows = events.map((e) => toEventsRowForProvider(provider, ownerId, e));
    const { error: evErr } = await supabase
      .from("events")
      .upsert(eventRows, { onConflict: "owner_id,external_event_id" });
    if (evErr) {
      return {
        status: "error",
        error: `events upsert: ${evErr.message ?? String(evErr)}`,
      };
    }

    await syncEventAttendees(supabase, provider, ownerId, events);
  }

  if (pruneMissing) {
    const keepExternalIds = new Set(
      events.map((e) => externalEventIdForProvider(provider, e.id)),
    );
    const keepSignalIds = new Set(
      events.map((e) => signalEventIdForProvider(provider, e.id)),
    );
    await pruneProviderCalendarRows(
      supabase,
      provider,
      ownerId,
      keepExternalIds,
      keepSignalIds,
      options.window,
    );
  }

  return { status: "ok" };
}

export async function removeCalendarProviderEvent(
  supabase: SupabaseClient,
  provider: CalendarSyncProvider,
  ownerId: string,
  providerEventId: string,
): Promise<CalendarSyncPersistResult> {
  const externalId = externalEventIdForProvider(provider, providerEventId);
  const signalId = signalEventIdForProvider(provider, providerEventId);

  const { data: rows } = await supabase
    .from("events")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("external_event_id", externalId)
    .maybeSingle();

  if (rows?.id) {
    await supabase.from("event_attendees").delete().eq("event_id", rows.id);
    await supabase.from("events").delete().eq("id", rows.id);
  }

  await supabase
    .from("inferred_signal_calendar")
    .delete()
    .eq("owner_id", ownerId)
    .eq("event_id", signalId);

  return { status: "ok" };
}

async function syncEventAttendees(
  supabase: SupabaseClient,
  provider: CalendarSyncProvider,
  ownerId: string,
  events: CalendarSyncEvent[],
): Promise<void> {
  const allEmails = Array.from(
    new Set(events.flatMap((e) => e.attendeeEmails ?? [])),
  );
  let emailToContactId = new Map<string, string>();
  if (allEmails.length > 0) {
    const { data: contactRows } = await supabase
      .from("contacts")
      .select("id, email")
      .eq("owner_id", ownerId)
      .in("email", allEmails);
    emailToContactId = new Map(
      ((contactRows ?? []) as Array<{ id: string; email: string | null }>)
        .filter((c) => c.email)
        .map((c) => [c.email!.toLowerCase(), c.id]),
    );
  }

  const externalIds = events.map((e) =>
    externalEventIdForProvider(provider, e.id),
  );
  const { data: eventIdRows } = await supabase
    .from("events")
    .select("id, external_event_id")
    .eq("owner_id", ownerId)
    .in("external_event_id", externalIds);
  const externalToEventId = new Map(
    ((eventIdRows ?? []) as Array<{
      id: string;
      external_event_id: string;
    }>).map((r) => [r.external_event_id, r.id]),
  );

  const touchedEventIds = Array.from(externalToEventId.values());
  if (touchedEventIds.length === 0) return;

  await supabase.from("event_attendees").delete().in("event_id", touchedEventIds);

  const links: Array<{ event_id: string; contact_id: string }> = [];
  for (const e of events) {
    const eventId = externalToEventId.get(
      externalEventIdForProvider(provider, e.id),
    );
    if (!eventId) continue;
    for (const email of e.attendeeEmails ?? []) {
      const cid = emailToContactId.get(email);
      if (cid) links.push({ event_id: eventId, contact_id: cid });
    }
  }
  if (links.length > 0) {
    await supabase.from("event_attendees").insert(links);
  }
}

async function pruneProviderCalendarRows(
  supabase: SupabaseClient,
  provider: CalendarSyncProvider,
  ownerId: string,
  keepExternalIds: Set<string>,
  keepSignalIds: Set<string>,
  window?: { timeMin: string; timeMax: string },
): Promise<void> {
  let eventsQuery = supabase
    .from("events")
    .select("id, external_event_id, start")
    .eq("owner_id", ownerId)
    .eq("source", provider);
  if (window) {
    eventsQuery = eventsQuery
      .gte("start", window.timeMin)
      .lte("start", window.timeMax);
  }
  const { data: existingEvents } = await eventsQuery;

  const eventIdsToDelete = ((existingEvents ?? []) as Array<{
    id: string;
    external_event_id: string;
  }>)
    .filter((row) => !keepExternalIds.has(row.external_event_id))
    .map((row) => row.id);

  if (eventIdsToDelete.length > 0) {
    await supabase.from("event_attendees").delete().in("event_id", eventIdsToDelete);
    await supabase.from("events").delete().in("id", eventIdsToDelete);
  }

  let signalQuery = supabase
    .from("inferred_signal_calendar")
    .select("event_id, start")
    .eq("owner_id", ownerId);
  if (provider === "outlook") {
    signalQuery = signalQuery.like("event_id", `${OUTLOOK_EVENT_PREFIX}%`);
  } else {
    signalQuery = signalQuery.not("event_id", "like", `${OUTLOOK_EVENT_PREFIX}%`);
  }
  if (window) {
    signalQuery = signalQuery
      .gte("start", window.timeMin)
      .lte("start", window.timeMax);
  }
  const { data: existingSignals } = await signalQuery;

  const signalIdsToDelete = ((existingSignals ?? []) as Array<{ event_id: string }>)
    .filter((row) => !keepSignalIds.has(row.event_id))
    .map((row) => row.event_id);

  if (signalIdsToDelete.length > 0) {
    await supabase
      .from("inferred_signal_calendar")
      .delete()
      .eq("owner_id", ownerId)
      .in("event_id", signalIdsToDelete);
  }
}
