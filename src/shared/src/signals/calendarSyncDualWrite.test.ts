import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EVENTS_GOOGLE_OWNED_COLUMNS,
  EVENTS_USER_OWNED_COLUMNS,
  eventsUpsertKeys,
  persistCalendarSyncSnapshot,
  toEventsGoogleRow,
  toEventsOutlookRow,
  toEventsRowForProvider,
  toSignalRow,
  toSignalRowForProvider,
} from "./calendarSyncDualWrite";

describe("calendarSyncDualWrite", () => {
  const event = {
    id: "google-abc",
    title: "Standup",
    start: "2026-05-21T09:00:00.000Z",
    end: "2026-05-21T09:30:00.000Z",
    isAllDay: false,
    location: "Zoom",
  };

  it("documents Google-owned vs user-owned events columns", () => {
    expect(EVENTS_GOOGLE_OWNED_COLUMNS).toContain("title");
    expect(EVENTS_USER_OWNED_COLUMNS).toContain("aim");
    expect(EVENTS_USER_OWNED_COLUMNS).not.toContain("title");
  });

  it("maps a fetcher event to inferred_signal_calendar row shape", () => {
    expect(toSignalRow("owner-1", event)).toEqual({
      owner_id: "owner-1",
      event_id: "google-abc",
      title: "Standup",
      start: event.start,
      end: event.end,
      is_all_day: false,
    });
  });

  it("prefixes Outlook signal event_ids", () => {
    expect(toSignalRowForProvider("outlook", "owner-1", event)).toEqual({
      owner_id: "owner-1",
      event_id: "outlook:google-abc",
      title: "Standup",
      start: event.start,
      end: event.end,
      is_all_day: false,
    });
  });

  it("maps a fetcher event to events table Google upsert shape", () => {
    expect(toEventsGoogleRow("owner-1", event)).toEqual({
      owner_id: "owner-1",
      external_event_id: "google-abc",
      source: "google",
      title: "Standup",
      start: event.start,
      end: event.end,
      is_all_day: false,
      location: "Zoom",
    });
  });

  it("maps Outlook events with prefixed external_event_id", () => {
    expect(toEventsOutlookRow("owner-1", event)).toEqual({
      owner_id: "owner-1",
      external_event_id: "outlook:google-abc",
      source: "outlook",
      title: "Standup",
      start: event.start,
      end: event.end,
      is_all_day: false,
      location: "Zoom",
    });
  });

  it("events upsert payload omits user-owned enrichment columns", () => {
    for (const provider of ["google", "outlook"] as const) {
      const row = toEventsRowForProvider(provider, "owner-1", event);
      const keys = eventsUpsertKeys(row);
      for (const col of EVENTS_USER_OWNED_COLUMNS) {
        expect(keys).not.toContain(col);
      }
      for (const col of EVENTS_GOOGLE_OWNED_COLUMNS) {
        expect(keys).toContain(col);
      }
    }
  });

  it("persistCalendarSyncSnapshot upserts only provider-owned events columns", async () => {
    const upsert = jest.fn().mockResolvedValue({ data: null, error: null });
    const makeDeleteChain = () => {
      const chain: { eq: jest.Mock; not: jest.Mock; like: jest.Mock } = {} as never;
      chain.eq = jest.fn(() => chain);
      chain.not = jest.fn(() => chain);
      chain.like = jest.fn(() => chain);
      return chain;
    };
    const emptyResult = { data: [] as unknown[], error: null };
    const makeAwaitableChain = () => {
      const chain: {
        eq: jest.Mock;
        gte: jest.Mock;
        lte: jest.Mock;
        like: jest.Mock;
        not: jest.Mock;
        in: jest.Mock;
        then: Promise<typeof emptyResult>["then"];
      } = {} as never;
      chain.eq = jest.fn(() => chain);
      chain.gte = jest.fn(() => chain);
      chain.lte = jest.fn(() => chain);
      chain.like = jest.fn(() => chain);
      chain.not = jest.fn(() => chain);
      chain.in = jest.fn(() => Promise.resolve(emptyResult));
      chain.then = (onFulfilled, onRejected) =>
        Promise.resolve(emptyResult).then(onFulfilled, onRejected);
      return chain;
    };
    const deleteFn = jest.fn(() => makeDeleteChain());
    const from = jest.fn((table: string) => {
      if (table === "events" || table === "inferred_signal_calendar") {
        return {
          upsert,
          delete: deleteFn,
          select: jest.fn(() => makeAwaitableChain()),
        };
      }
      if (table === "contacts") {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              in: jest.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        };
      }
      if (table === "event_attendees") {
        return {
          delete: jest.fn().mockResolvedValue({ data: null, error: null }),
          insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return { upsert, delete: deleteFn };
    });
    const supabase = { from } as unknown as SupabaseClient;

    await persistCalendarSyncSnapshot(supabase, "google", "owner-1", [event]);

    const eventsUpsertCall = upsert.mock.calls.find(
      ([rows]) =>
        Array.isArray(rows) &&
        rows[0]?.external_event_id === "google-abc",
    );
    expect(eventsUpsertCall).toBeDefined();
    const row = (eventsUpsertCall![0] as Array<Record<string, unknown>>)[0];
    for (const col of EVENTS_USER_OWNED_COLUMNS) {
      expect(row).not.toHaveProperty(col);
    }
  });
});
