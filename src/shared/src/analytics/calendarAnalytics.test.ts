import { calendarAnalytics, cumulativeGrowth } from "./calendarAnalytics";
import type { Event } from "../events/EventsClient";

function ev(over: Partial<Event>): Event {
  return {
    id: "ev-1",
    title: null,
    start: "2026-05-20T10:00:00Z",
    end: "2026-05-20T11:00:00Z",
    isAllDay: false,
    location: null,
    aim: null,
    requiredPrep: null,
    status: "planned",
    type: "meeting",
    source: "manual",
    externalEventId: null,
    attendees: [],
    ...over,
  };
}

describe("calendarAnalytics", () => {
  it("counts entries, status, and type breakdowns", () => {
    const result = calendarAnalytics({
      events: [
        ev({ id: "1", status: "occurred", type: "meeting" }),
        ev({ id: "2", status: "planned", type: "meeting" }),
        ev({ id: "3", status: "planned", type: "personal" }),
        ev({ id: "4", status: "missed", type: "work" }),
        ev({ id: "5", status: "cancelled", type: "uni" }),
        ev({ id: "6", status: "attended", type: "activity" }),
      ],
    });
    expect(result.totalEntries).toBe(6);
    expect(result.statusCounts).toEqual({
      planned: 2,
      occurred: 1,
      attended: 1,
      missed: 1,
      cancelled: 1,
    });
    expect(result.typeCounts).toEqual({
      work: 1,
      meeting: 2,
      uni: 1,
      personal: 1,
      activity: 1,
    });
  });

  it("counts distinct days from event start", () => {
    const result = calendarAnalytics({
      events: [
        ev({ id: "1", start: "2026-05-20T10:00:00Z" }),
        ev({ id: "2", start: "2026-05-20T14:00:00Z" }),
        ev({ id: "3", start: "2026-05-21T10:00:00Z" }),
        ev({ id: "4", start: "2026-05-22T09:00:00Z" }),
      ],
    });
    expect(result.daysWithEntries).toBe(3);
  });
});

describe("cumulativeGrowth", () => {
  it("returns one bucket per day with a running running total", () => {
    const buckets = cumulativeGrowth({
      from: "2026-05-20T00:00:00Z",
      to: "2026-05-22T00:00:00Z",
      events: [
        ev({ id: "1", start: "2026-05-20T10:00:00Z" }),
        ev({ id: "2", start: "2026-05-21T10:00:00Z" }),
        ev({ id: "3", start: "2026-05-21T15:00:00Z" }),
      ],
      filter: { axis: "all" },
    });
    expect(buckets).toEqual([
      { date: "2026-05-20", count: 1 },
      { date: "2026-05-21", count: 3 },
      { date: "2026-05-22", count: 3 },
    ]);
  });

  it("narrows by status filter", () => {
    const buckets = cumulativeGrowth({
      from: "2026-05-20T00:00:00Z",
      to: "2026-05-21T00:00:00Z",
      events: [
        ev({ id: "1", start: "2026-05-20T10:00:00Z", status: "planned" }),
        ev({ id: "2", start: "2026-05-20T11:00:00Z", status: "attended" }),
        ev({ id: "3", start: "2026-05-21T10:00:00Z", status: "attended" }),
      ],
      filter: { axis: "status", value: "attended" },
    });
    expect(buckets).toEqual([
      { date: "2026-05-20", count: 1 },
      { date: "2026-05-21", count: 2 },
    ]);
  });
});
