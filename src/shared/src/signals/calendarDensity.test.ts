import {
  summariseCalendarDensity,
  type RawCalendarEvent,
} from "./calendarDensity";

const ASOF = new Date("2026-05-19T08:00:00Z");

function evt(over: Partial<RawCalendarEvent> & { start: string; end: string }): RawCalendarEvent {
  return {
    id: "evt",
    title: "untitled",
    isAllDay: false,
    ...over,
  };
}

describe("summariseCalendarDensity", () => {
  it("returns density 0 and a flag when no events fall in the 7-day window", () => {
    const result = summariseCalendarDensity([], ASOF);
    expect(result).toEqual({
      asOf: ASOF.toISOString(),
      density: 0,
      next72hHours: 0,
      bucket: "free",
    });
  });

  it("light week: <10h of events bucketed as 'light'", () => {
    const events = [
      evt({ start: "2026-05-19T09:00:00Z", end: "2026-05-19T10:00:00Z" }),
      evt({ start: "2026-05-20T18:00:00Z", end: "2026-05-20T19:00:00Z" }),
    ];
    const r = summariseCalendarDensity(events, ASOF);
    expect(r.density).toBe(2);
    expect(r.next72hHours).toBe(2);
    expect(r.bucket).toBe("light");
  });

  it("packed week: ≥25h flagged as 'packed' (next-72h prompt focus reported separately)", () => {
    const events: RawCalendarEvent[] = [];
    // 30 1-hour events spread across the 7 days
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 5; hour++) {
        const start = new Date(ASOF);
        start.setUTCDate(start.getUTCDate() + day);
        start.setUTCHours(9 + hour, 0, 0, 0);
        const end = new Date(start);
        end.setUTCHours(end.getUTCHours() + 1);
        events.push(evt({ start: start.toISOString(), end: end.toISOString() }));
      }
    }
    const r = summariseCalendarDensity(events, ASOF);
    expect(r.density).toBe(35);
    expect(r.bucket).toBe("packed");
    expect(r.next72hHours).toBe(15); // 3 days × 5h
  });

  it("ignores events outside the 7-day forward window", () => {
    const past = evt({ start: "2026-05-10T09:00:00Z", end: "2026-05-10T10:00:00Z" });
    const future = evt({ start: "2026-06-19T09:00:00Z", end: "2026-06-19T10:00:00Z" });
    const inWindow = evt({ start: "2026-05-21T09:00:00Z", end: "2026-05-21T10:00:00Z" });
    const r = summariseCalendarDensity([past, future, inWindow], ASOF);
    expect(r.density).toBe(1);
  });

  it("clips event durations to the window edges so a multi-day event still counts proportionally", () => {
    const e = evt({
      start: "2026-05-18T22:00:00Z",
      end: "2026-05-19T10:00:00Z",
    }); // 12h event spanning the window start
    const r = summariseCalendarDensity([e], ASOF);
    // ASOF is 2026-05-19T08:00Z; the in-window portion is 08→10 = 2h
    expect(r.density).toBe(2);
  });

  it("treats all-day events as 8 working hours each (a heuristic, not a clock truth)", () => {
    const allDay = evt({
      start: "2026-05-19T00:00:00Z",
      end: "2026-05-20T00:00:00Z",
      isAllDay: true,
    });
    const r = summariseCalendarDensity([allDay], ASOF);
    expect(r.density).toBe(8);
  });
});
