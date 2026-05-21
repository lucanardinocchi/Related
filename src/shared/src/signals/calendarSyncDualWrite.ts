import type { RawCalendarEvent } from "./calendarDensity";

/**
 * ADR-0010 dual-write contract. `sync-calendar` (and CalendarCollector for
 * the signal leg) writes the same Google snapshot to:
 *
 *   1. `inferred_signal_calendar` — agent Calendar density input only.
 *   2. `events` — user-facing /calendar surface (Google rows only).
 *
 * On `events` upsert, only GOOGLE_OWNED columns are in the payload so
 * USER_OWNED enrichment survives re-syncs. Deno Edge Functions mirror this
 * contract inline — keep in sync when changing either side.
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

export function toEventsGoogleRow(
  ownerId: string,
  event: RawCalendarEvent & { location?: string | null },
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
  event: RawCalendarEvent & { location?: string | null },
): CalendarEventsOutlookRow {
  return {
    owner_id: ownerId,
    external_event_id: `outlook:${event.id}`,
    source: "outlook",
    title: event.title ?? null,
    start: event.start,
    end: event.end,
    is_all_day: event.isAllDay,
    location: event.location ?? null,
  };
}

export function toOutlookSignalEventId(graphEventId: string): string {
  return `outlook:${graphEventId}`;
}
