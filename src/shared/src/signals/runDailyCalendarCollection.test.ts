import type { SupabaseClient } from "@supabase/supabase-js";
import { runDailyCalendarCollection } from "./runDailyCalendarCollection";
import { FakeCalendarFetcher } from "./FakeCalendarFetcher";

type Resolved<T> = { data: T; error: null } | { data: null; error: { message: string } };

function makeQueryMock() {
  const upsertResolve = jest.fn<Promise<Resolved<unknown>>, [unknown, unknown?]>();
  const deleteNot = jest.fn<Promise<Resolved<unknown>>, []>();
  const not = jest.fn(() => deleteNot());
  const eq = jest.fn(() => ({ not }));
  const deleteFn = jest.fn(() => ({ eq }));
  const upsert = jest.fn((rows: unknown, opts?: unknown) => upsertResolve(rows, opts));
  const from = jest.fn((_t: string) => ({ upsert, delete: deleteFn }));
  return { from, upsert, upsertResolve, delete: deleteFn, eq, not, deleteNot };
}

describe("runDailyCalendarCollection", () => {
  it("collects via the fetcher and persists for a single owner, returning a summary", async () => {
    const q = makeQueryMock();
    q.upsertResolve.mockResolvedValue({ data: null, error: null });
    q.deleteNot.mockResolvedValue({ data: null, error: null });
    const supabase = { from: q.from } as unknown as SupabaseClient;

    const fetcher = new FakeCalendarFetcher([
      {
        id: "evt-1",
        title: "Coffee",
        start: "2026-05-20T09:00:00Z",
        end: "2026-05-20T10:00:00Z",
        isAllDay: false,
      },
      {
        id: "evt-2",
        title: "Lunch",
        start: "2026-05-20T12:00:00Z",
        end: "2026-05-20T13:00:00Z",
        isAllDay: false,
      },
    ]);

    const asOf = new Date("2026-05-19T10:00:00Z");
    const summary = await runDailyCalendarCollection({
      supabase,
      fetcher,
      ownerId: "u-1",
      asOf,
    });

    expect(q.from).toHaveBeenCalledWith("inferred_signal_calendar");
    expect(q.upsert).toHaveBeenCalledTimes(1);
    expect(summary.eventsWritten).toBe(2);
    // 7-day forward window — ASOF + 7d.
    expect(summary.windowEnd).toBe("2026-05-26T10:00:00.000Z");
  });

  it("re-running for the same day is idempotent (re-upserts on the unique key)", async () => {
    const q = makeQueryMock();
    q.upsertResolve.mockResolvedValue({ data: null, error: null });
    q.deleteNot.mockResolvedValue({ data: null, error: null });
    const supabase = { from: q.from } as unknown as SupabaseClient;
    const fetcher = new FakeCalendarFetcher([
      {
        id: "evt-1",
        title: "Coffee",
        start: "2026-05-20T09:00:00Z",
        end: "2026-05-20T10:00:00Z",
        isAllDay: false,
      },
    ]);
    const asOf = new Date("2026-05-19T10:00:00Z");

    await runDailyCalendarCollection({ supabase, fetcher, ownerId: "u-1", asOf });
    await runDailyCalendarCollection({ supabase, fetcher, ownerId: "u-1", asOf });

    // Both runs upserted via the (owner_id, event_id) onConflict key.
    expect(q.upsert).toHaveBeenCalledTimes(2);
    for (const call of q.upsert.mock.calls) {
      expect(call[1]).toEqual({ onConflict: "owner_id,event_id" });
    }
  });

  it("propagates fetcher failures so an upstream cron can retry/log", async () => {
    const q = makeQueryMock();
    const supabase = { from: q.from } as unknown as SupabaseClient;
    const fetcher = {
      fetch: async () => {
        throw new Error("calendar auth revoked");
      },
    };

    await expect(
      runDailyCalendarCollection({
        supabase,
        fetcher: fetcher as unknown as FakeCalendarFetcher,
        ownerId: "u-1",
        asOf: new Date(),
      }),
    ).rejects.toThrow(/calendar auth revoked/);
  });

  it("accepts a bare CalendarFetcher function as well as a FakeCalendarFetcher", async () => {
    const q = makeQueryMock();
    q.upsertResolve.mockResolvedValue({ data: null, error: null });
    q.deleteNot.mockResolvedValue({ data: null, error: null });
    const supabase = { from: q.from } as unknown as SupabaseClient;

    const fnFetcher = async () => [
      {
        id: "evt-1",
        title: "Coffee",
        start: "2026-05-20T09:00:00Z",
        end: "2026-05-20T10:00:00Z",
        isAllDay: false,
      },
    ];

    const summary = await runDailyCalendarCollection({
      supabase,
      fetcher: fnFetcher,
      ownerId: "u-1",
      asOf: new Date("2026-05-19T10:00:00Z"),
    });

    expect(summary.eventsWritten).toBe(1);
  });
});
