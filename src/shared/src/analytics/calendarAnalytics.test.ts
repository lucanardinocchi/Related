import { calendarAnalytics } from "./calendarAnalytics";
import type { Interaction } from "../interactions/InteractionsClient";
import type { CalendarEvent } from "../calendar/CalendarEventsClient";

function interaction(over: Partial<Interaction>): Interaction {
  return {
    id: "i-1",
    time: "2026-05-20T10:00:00Z",
    kind: "coffee",
    notes: null,
    status: "occurred",
    contacts: [],
    ...over,
  };
}

function event(over: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: "e-1",
    externalEventId: "g-1",
    source: "google",
    title: null,
    start: "2026-05-20T11:00:00Z",
    end: "2026-05-20T12:00:00Z",
    isAllDay: false,
    fetchedAt: "2026-05-20T08:00:00Z",
    ...over,
  };
}

describe("calendarAnalytics", () => {
  it("counts entries, interaction statuses, and external source breakdown", () => {
    const result = calendarAnalytics({
      interactions: [
        interaction({ id: "i-1", status: "occurred" }),
        interaction({ id: "i-2", status: "planned" }),
        interaction({ id: "i-3", status: "planned" }),
        interaction({ id: "i-4", status: "missed" }),
      ],
      externalEvents: [
        event({ id: "e-1", source: "google" }),
        event({ id: "e-2", source: "google" }),
      ],
    });
    expect(result.totalEntries).toBe(6);
    expect(result.interactionCounts).toEqual({
      planned: 2,
      occurred: 1,
      missed: 1,
    });
    expect(result.externalCountsBySource).toEqual({ google: 2 });
  });

  it("counts distinct days across interactions and external events", () => {
    const result = calendarAnalytics({
      interactions: [
        interaction({ id: "i-1", time: "2026-05-20T10:00:00Z" }),
        interaction({ id: "i-2", time: "2026-05-20T14:00:00Z" }),
        interaction({ id: "i-3", time: "2026-05-21T10:00:00Z" }),
      ],
      externalEvents: [
        event({ id: "e-1", start: "2026-05-22T09:00:00Z" }),
        event({ id: "e-2", start: "2026-05-20T09:00:00Z" }),
      ],
    });
    expect(result.daysWithEntries).toBe(3);
  });
});
