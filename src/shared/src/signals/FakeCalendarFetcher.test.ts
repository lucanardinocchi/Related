import { FakeCalendarFetcher } from "./FakeCalendarFetcher";
import type { RawCalendarEvent } from "./calendarDensity";

describe("FakeCalendarFetcher", () => {
  it("matches the CalendarFetcher signature (async fn returning RawCalendarEvent[])", async () => {
    const fetcher = new FakeCalendarFetcher([]);
    const events = await fetcher.fetch(new Date());
    expect(events).toEqual([]);
  });

  it("returns the configured events deterministically", async () => {
    const events: RawCalendarEvent[] = [
      {
        id: "evt-1",
        title: "Standup",
        start: "2026-05-19T09:00:00Z",
        end: "2026-05-19T09:30:00Z",
        isAllDay: false,
      },
      {
        id: "evt-2",
        title: "Birthday",
        start: "2026-05-20T00:00:00Z",
        end: "2026-05-21T00:00:00Z",
        isAllDay: true,
      },
    ];
    const fetcher = new FakeCalendarFetcher(events);

    const first = await fetcher.fetch(new Date("2026-05-19T08:00:00Z"));
    const second = await fetcher.fetch(new Date("2026-05-20T08:00:00Z"));

    expect(first).toEqual(events);
    expect(second).toEqual(events);
  });

  it("exposes a function-shaped fetcher matching the CalendarFetcher type", async () => {
    // CalendarFetcher is a function type — `(asOf: Date) => Promise<RawCalendarEvent[]>`.
    // The instance method `fetch` must be callable as a bare function so a
    // FakeCalendarFetcher can be passed where a CalendarFetcher is expected.
    const fetcher = new FakeCalendarFetcher([
      {
        id: "evt-1",
        title: "Standup",
        start: "2026-05-19T09:00:00Z",
        end: "2026-05-19T09:30:00Z",
        isAllDay: false,
      },
    ]);
    const asFn = fetcher.asCalendarFetcher();
    const events = await asFn(new Date());
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe("evt-1");
  });

  it("returns a defensive copy so mutations from callers don't leak into the source", async () => {
    const events: RawCalendarEvent[] = [
      {
        id: "evt-1",
        title: "Standup",
        start: "2026-05-19T09:00:00Z",
        end: "2026-05-19T09:30:00Z",
        isAllDay: false,
      },
    ];
    const fetcher = new FakeCalendarFetcher(events);

    const fetched = await fetcher.fetch(new Date());
    fetched.push({
      id: "evt-mutated",
      title: "Sneaky",
      start: "x",
      end: "y",
      isAllDay: false,
    });
    const refetched = await fetcher.fetch(new Date());

    expect(refetched).toHaveLength(1);
    expect(refetched[0]?.id).toBe("evt-1");
  });

  it("DEFAULT_DEMO_EVENTS gives demo-mode signal data without OAuth", () => {
    const demo = FakeCalendarFetcher.demo();
    // It's a fetcher, not a raw array.
    expect(typeof demo.fetch).toBe("function");
  });
});
