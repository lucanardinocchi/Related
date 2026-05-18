import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CalendarCollector,
  type CalendarFetcher,
} from "./CalendarCollector";

type Resolved<T> = { data: T; error: null } | { data: null; error: { message: string } };

function makeQueryMock() {
  // .from('inferred_signal_calendar').upsert([...], { onConflict: 'owner_id,event_id' })
  // .from('inferred_signal_calendar').delete().eq('owner_id', id).not('event_id', 'in', '(...)')
  const upsertResolve = jest.fn<Promise<Resolved<unknown>>, [unknown]>();
  const deleteNot = jest.fn<Promise<Resolved<unknown>>, []>();
  const not = jest.fn(() => deleteNot());
  const eq = jest.fn(() => ({ not }));
  const deleteFn = jest.fn(() => ({ eq }));
  const upsert = jest.fn((rows: unknown) => upsertResolve(rows));
  const from = jest.fn((_t: string) => ({ upsert, delete: deleteFn }));
  return { from, upsert, upsertResolve, delete: deleteFn, eq, not, deleteNot };
}

function withCollector(fetcher: CalendarFetcher) {
  const q = makeQueryMock();
  const supa = { from: q.from } as unknown as SupabaseClient;
  return {
    q,
    collector: new CalendarCollector({ supabase: supa, fetcher }),
  };
}

describe("CalendarCollector.runFor", () => {
  it("transforms the fetcher's events into upsert rows tagged with the owner_id", async () => {
    const fetcher: CalendarFetcher = jest.fn().mockResolvedValue([
      {
        id: "evt-1",
        title: "Coffee",
        start: "2026-05-20T09:00:00Z",
        end: "2026-05-20T10:00:00Z",
        isAllDay: false,
      },
      {
        id: "evt-2",
        title: null,
        start: "2026-05-21T00:00:00Z",
        end: "2026-05-22T00:00:00Z",
        isAllDay: true,
      },
    ]);
    const { q, collector } = withCollector(fetcher);
    q.upsertResolve.mockResolvedValue({ data: null, error: null });
    q.deleteNot.mockResolvedValue({ data: null, error: null });

    await collector.runFor("u-1", new Date("2026-05-19T00:00:00Z"));

    expect(q.from).toHaveBeenCalledWith("inferred_signal_calendar");
    expect(q.upsert).toHaveBeenCalledWith(
      [
        {
          owner_id: "u-1",
          event_id: "evt-1",
          title: "Coffee",
          start: "2026-05-20T09:00:00Z",
          end: "2026-05-20T10:00:00Z",
          is_all_day: false,
        },
        {
          owner_id: "u-1",
          event_id: "evt-2",
          title: null,
          start: "2026-05-21T00:00:00Z",
          end: "2026-05-22T00:00:00Z",
          is_all_day: true,
        },
      ],
      { onConflict: "owner_id,event_id" },
    );
    // Garbage-collects events the fetcher no longer returned.
    expect(q.eq).toHaveBeenCalledWith("owner_id", "u-1");
    expect(q.not).toHaveBeenCalledWith(
      "event_id",
      "in",
      "(evt-1,evt-2)",
    );
  });

  it("on an empty fetcher response, clears the User's window without erroring", async () => {
    const fetcher: CalendarFetcher = jest.fn().mockResolvedValue([]);
    const { q, collector } = withCollector(fetcher);
    q.upsertResolve.mockResolvedValue({ data: null, error: null });
    q.deleteNot.mockResolvedValue({ data: null, error: null });

    await collector.runFor("u-1", new Date());

    // No upsert call — but a full delete (no exclusion list) to clear stale.
    expect(q.upsert).not.toHaveBeenCalled();
    // Delete is still scoped to this owner, with an "exclude none" list.
    expect(q.eq).toHaveBeenCalledWith("owner_id", "u-1");
  });

  it("propagates fetcher errors instead of swallowing them", async () => {
    const fetcher: CalendarFetcher = jest
      .fn()
      .mockRejectedValue(new Error("calendar auth revoked"));
    const { collector } = withCollector(fetcher);

    await expect(collector.runFor("u-1", new Date())).rejects.toThrow(
      /calendar auth revoked/,
    );
  });
});
