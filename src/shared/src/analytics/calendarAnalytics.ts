import type {
  Interaction,
  InteractionStatus,
  InteractionCategory,
} from "../interactions/InteractionsClient";
import type {
  CalendarEvent,
  CalendarEventOverlay,
} from "../calendar/CalendarEventsClient";

/**
 * Header analytics for the web /calendar page (per ADR-0008). All counts
 * are over the merged set the page is currently rendering — the helper
 * takes pre-fetched lists so the page can compose them with whatever
 * window it's showing without re-querying.
 */
export interface CalendarAnalytics {
  /** Total entries (Interactions + external events) in the window. */
  totalEntries: number;
  /** Interaction count by status. */
  interactionCounts: {
    planned: number;
    occurred: number;
    attended: number;
    missed: number;
    cancelled: number;
  };
  /** Count of external events from each source. */
  externalCountsBySource: Record<string, number>;
  /** Distinct days that have at least one entry. */
  daysWithEntries: number;
}

export function calendarAnalytics(input: {
  interactions: Interaction[];
  externalEvents: CalendarEvent[];
}): CalendarAnalytics {
  const interactionCounts = {
    planned: 0,
    occurred: 0,
    attended: 0,
    missed: 0,
    cancelled: 0,
  };
  for (const i of input.interactions) {
    interactionCounts[i.status] += 1;
  }

  const externalCountsBySource: Record<string, number> = {};
  for (const e of input.externalEvents) {
    externalCountsBySource[e.source] =
      (externalCountsBySource[e.source] ?? 0) + 1;
  }

  const daySet = new Set<string>();
  for (const i of input.interactions) {
    daySet.add(i.time.slice(0, 10));
  }
  for (const e of input.externalEvents) {
    daySet.add(e.start.slice(0, 10));
  }

  return {
    totalEntries: input.interactions.length + input.externalEvents.length,
    interactionCounts,
    externalCountsBySource,
    daysWithEntries: daySet.size,
  };
}

/**
 * One point on the cumulative growth chart — a calendar day and the
 * running total of matching entries from the window start up to and
 * including that day.
 */
export interface CumulativeBucket {
  /** YYYY-MM-DD. */
  date: string;
  count: number;
}

export interface CumulativeGrowthInput {
  /** Inclusive window start. ISO string. */
  from: string;
  /** Inclusive window end. ISO string. */
  to: string;
  interactions: Interaction[];
  externalEvents: CalendarEvent[];
  overlays: CalendarEventOverlay[];
  /**
   * Filter that picks which entries contribute. `all` is the unfiltered
   * total — drives the default chart view so the cumulative line shows
   * every event, before the User narrows by status or category.
   */
  filter:
    | { axis: "all" }
    | { axis: "status"; value: InteractionStatus }
    | { axis: "category"; value: InteractionCategory };
}

/** UTC midnight of the given ISO instant, returned as a Date. */
function utcStartOfDay(iso: string): Date {
  const d = new Date(iso);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** YYYY-MM-DD in UTC. Matches `iso.slice(0, 10)` for ISO Z strings. */
function ymdUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Cumulative running-total of entries matching the given filter, bucketed
 * by day across [from, to]. Used by the Calendar page's growth chart —
 * one bucket per day, count is the cumulative number of matching entries
 * whose time/start falls in the window on or before that day.
 *
 * External Google events contribute their User-assigned overlay status or
 * category (no overlay = no contribution); Interactions contribute their
 * own status / category.
 */
export function cumulativeGrowth(
  input: CumulativeGrowthInput,
): CumulativeBucket[] {
  const overlayByEvent = new Map<string, CalendarEventOverlay>();
  for (const o of input.overlays) overlayByEvent.set(o.eventId, o);

  // Per-day delta — number of matching entries whose day == this day.
  const deltas = new Map<string, number>();
  const bump = (key: string) => {
    deltas.set(key, (deltas.get(key) ?? 0) + 1);
  };

  const matchesInteraction = (i: Interaction) => {
    if (input.filter.axis === "all") return true;
    if (input.filter.axis === "status") return i.status === input.filter.value;
    return i.category === input.filter.value;
  };

  for (const i of input.interactions) {
    if (matchesInteraction(i)) bump(i.time.slice(0, 10));
  }

  for (const e of input.externalEvents) {
    if (input.filter.axis === "all") {
      // Unfiltered total includes every external event, regardless of
      // whether the User has assigned an overlay yet.
      bump(e.start.slice(0, 10));
      continue;
    }
    const o = overlayByEvent.get(e.externalEventId);
    if (!o) continue;
    const matched =
      input.filter.axis === "status"
        ? o.status === input.filter.value
        : o.category === input.filter.value;
    if (matched) bump(e.start.slice(0, 10));
  }

  // Walk the date axis day-by-day so the chart line is continuous even
  // through gaps with zero entries. Bucket keys are UTC YYYY-MM-DD to
  // match `iso.slice(0,10)` on the entry side — mixing local and UTC
  // boundaries would silently land events in the wrong day when the
  // User's timezone offset crosses midnight relative to UTC.
  const buckets: CumulativeBucket[] = [];
  let running = 0;
  const cursor = utcStartOfDay(input.from);
  const end = utcStartOfDay(input.to);
  while (cursor.getTime() <= end.getTime()) {
    const key = ymdUTC(cursor);
    running += deltas.get(key) ?? 0;
    buckets.push({ date: key, count: running });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return buckets;
}
