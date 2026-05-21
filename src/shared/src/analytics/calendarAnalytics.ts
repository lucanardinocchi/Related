import type {
  Event,
  EventStatus,
  EventType,
} from "../events/EventsClient";

/**
 * Header analytics for the web /calendar page. Per ADR-0010 the calendar
 * reads from a unified `events` table so the helper takes a single Event
 * list and returns counts the header tiles render directly.
 */
export interface CalendarAnalytics {
  /** Total events in the window. */
  totalEntries: number;
  /** Count by status. */
  statusCounts: Record<EventStatus, number>;
  /** Count by type. */
  typeCounts: Record<EventType, number>;
  /** Distinct days that have at least one event. */
  daysWithEntries: number;
}

const ALL_STATUSES: EventStatus[] = [
  "planned",
  "occurred",
  "attended",
  "cancelled",
  "missed",
];

const ALL_TYPES: EventType[] = [
  "work",
  "meeting",
  "uni",
  "personal",
  "activity",
];

export function calendarAnalytics(input: {
  events: Event[];
}): CalendarAnalytics {
  const statusCounts = Object.fromEntries(
    ALL_STATUSES.map((s) => [s, 0]),
  ) as Record<EventStatus, number>;
  const typeCounts = Object.fromEntries(
    ALL_TYPES.map((t) => [t, 0]),
  ) as Record<EventType, number>;
  const daySet = new Set<string>();

  for (const e of input.events) {
    statusCounts[e.status] += 1;
    typeCounts[e.type] += 1;
    daySet.add(e.start.slice(0, 10));
  }

  return {
    totalEntries: input.events.length,
    statusCounts,
    typeCounts,
    daysWithEntries: daySet.size,
  };
}

/**
 * One bar on the daily-activity chart — a calendar day and the count of
 * matching entries that fall on it. Not a running total; each day stands
 * alone so the bar height reads as "how busy was that day". Reads from
 * the unified `events` model (ADR-0010).
 */
export interface DailyBucket {
  date: string;
  count: number;
}

export interface EventsPerDayInput {
  /** Inclusive window start. ISO string. */
  from: string;
  /** Inclusive window end. ISO string. */
  to: string;
  events: Event[];
  /**
   * Filter that picks which events contribute. `all` is the unfiltered
   * total — drives the default chart view so the bars show every event
   * before the User narrows by status or type.
   */
  filter:
    | { axis: "all" }
    | { axis: "status"; value: EventStatus }
    | { axis: "type"; value: EventType };
}

function utcStartOfDay(iso: string): Date {
  const d = new Date(iso);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function ymdUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Per-day count of matching events bucketed across [from, to]. Walks the
 * date axis so every day in the window appears (zero-count days included
 * — the bar chart shows them as gaps, which is meaningful). UTC bucketing
 * matches `iso.slice(0,10)` on the entry side; mixing local and UTC
 * boundaries would silently land events in the wrong day when the User's
 * timezone offset crosses midnight.
 */
export function eventsPerDay(input: EventsPerDayInput): DailyBucket[] {
  const counts = new Map<string, number>();
  const bump = (key: string) => {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };

  const matches = (e: Event) => {
    if (input.filter.axis === "all") return true;
    if (input.filter.axis === "status") return e.status === input.filter.value;
    return e.type === input.filter.value;
  };

  for (const e of input.events) {
    if (matches(e)) bump(e.start.slice(0, 10));
  }

  const buckets: DailyBucket[] = [];
  const cursor = utcStartOfDay(input.from);
  const end = utcStartOfDay(input.to);
  while (cursor.getTime() <= end.getTime()) {
    const key = ymdUTC(cursor);
    buckets.push({ date: key, count: counts.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return buckets;
}
