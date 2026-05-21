import type { Interaction } from "../interactions/InteractionsClient";
import type { CalendarEvent } from "../calendar/CalendarEventsClient";

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
    missed: number;
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
    missed: 0,
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
