import type { RawCalendarEvent } from "./calendarDensity";
import type { CalendarFetcher } from "./CalendarCollector";

/**
 * Deterministic calendar fetcher for tests AND demo mode.
 *
 * The real fetcher (Google Calendar OAuth, EventKit on iOS) is gated on
 * external credentials we don't have yet. The fake stands in so the rest
 * of the daily collection loop (collector, edge function, pg_cron, agent
 * prompts) can be shipped, exercised, and demoed today.
 *
 * Once OAuth lands, swap this for a `GoogleCalendarFetcher` (or
 * `EventKitCalendarFetcher`) that matches the same `CalendarFetcher`
 * signature — no other code in the loop needs to change.
 */
export class FakeCalendarFetcher {
  private readonly events: RawCalendarEvent[];

  constructor(events: RawCalendarEvent[]) {
    // Deep enough copy: events are plain objects with primitive fields,
    // so a per-element shallow copy is sufficient defence against
    // callers mutating the returned arrays.
    this.events = events.map((e) => ({ ...e }));
  }

  /** Returns the configured events. The Date argument is ignored. */
  fetch = async (_asOf: Date): Promise<RawCalendarEvent[]> => {
    return this.events.map((e) => ({ ...e }));
  };

  /**
   * Returns the fetcher in the bare-function shape the
   * `CalendarFetcher` type alias expects. Equivalent to `.fetch`, but
   * preserves the function-typed contract at call sites.
   */
  asCalendarFetcher(): CalendarFetcher {
    return (asOf: Date) => this.fetch(asOf);
  }

  /**
   * A small, illustrative event set for demo mode — gives the agent a
   * "light week with a meeting tomorrow" shape so prompts have real
   * signal to reason against before OAuth is provisioned.
   *
   * Anchored relative to the asOf provided at fetch time so the demo
   * stays plausible regardless of when it's invoked. The events
   * themselves don't move — what we anchor on is the "asOf at
   * construction time" so a single instance is still deterministic.
   */
  static demo(anchor: Date = new Date()): FakeCalendarFetcher {
    const day = 24 * 60 * 60 * 1000;
    const hour = 60 * 60 * 1000;
    const base = anchor.getTime();
    const iso = (offsetMs: number) => new Date(base + offsetMs).toISOString();

    return new FakeCalendarFetcher([
      {
        id: "demo-standup",
        title: "Team standup",
        start: iso(1 * day + 9 * hour),
        end: iso(1 * day + 9.5 * hour),
        isAllDay: false,
      },
      {
        id: "demo-coffee",
        title: "Coffee with Sam",
        start: iso(2 * day + 15 * hour),
        end: iso(2 * day + 16 * hour),
        isAllDay: false,
      },
      {
        id: "demo-focus",
        title: "Deep work block",
        start: iso(3 * day + 9 * hour),
        end: iso(3 * day + 12 * hour),
        isAllDay: false,
      },
    ]);
  }
}
