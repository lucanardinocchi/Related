import type { SupabaseClient } from "@supabase/supabase-js";
import { SleepCollector, type SleepFetcher } from "./SleepCollector";

type Resolved<T> = { data: T; error: null } | { data: null; error: { message: string } };

function makeQueryMock() {
  const upsertResolve = jest.fn<Promise<Resolved<unknown>>, [unknown]>();
  const deleteNot = jest.fn<Promise<Resolved<unknown>>, []>();
  const not = jest.fn(() => deleteNot());
  const eq = jest.fn(() => ({ not }));
  const deleteFn = jest.fn(() => ({ eq }));
  const upsert = jest.fn((rows: unknown) => upsertResolve(rows));
  const from = jest.fn((_t: string) => ({ upsert, delete: deleteFn }));
  return { from, upsert, upsertResolve, eq, not, deleteFn, deleteNot };
}

function withCollector(fetcher: SleepFetcher) {
  const q = makeQueryMock();
  const supa = { from: q.from } as unknown as SupabaseClient;
  return { q, collector: new SleepCollector({ supabase: supa, fetcher }) };
}

describe("SleepCollector.runFor", () => {
  it("transforms HealthKit records into upsert rows tagged with the owner_id", async () => {
    const fetcher: SleepFetcher = jest.fn().mockResolvedValue([
      {
        id: "hk-1",
        startedAt: "2026-05-18T22:00:00Z",
        endedAt: "2026-05-19T06:00:00Z",
        durationMinutes: 480,
        quality: "deep",
      },
    ]);
    const { q, collector } = withCollector(fetcher);
    q.upsertResolve.mockResolvedValue({ data: null, error: null });
    q.deleteNot.mockResolvedValue({ data: null, error: null });

    await collector.runFor("u-1", new Date());

    expect(q.from).toHaveBeenCalledWith("inferred_signal_sleep");
    expect(q.upsert).toHaveBeenCalledWith(
      [
        {
          owner_id: "u-1",
          record_id: "hk-1",
          started_at: "2026-05-18T22:00:00Z",
          ended_at: "2026-05-19T06:00:00Z",
          duration_minutes: 480,
          quality: "deep",
        },
      ],
      { onConflict: "owner_id,record_id" },
    );
    expect(q.eq).toHaveBeenCalledWith("owner_id", "u-1");
    expect(q.not).toHaveBeenCalledWith("record_id", "in", "(hk-1)");
  });

  it("clears the User's window when the fetcher returns no records", async () => {
    const fetcher: SleepFetcher = jest.fn().mockResolvedValue([]);
    const { q, collector } = withCollector(fetcher);
    q.upsertResolve.mockResolvedValue({ data: null, error: null });
    q.deleteNot.mockResolvedValue({ data: null, error: null });

    await collector.runFor("u-1", new Date());

    expect(q.upsert).not.toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith("owner_id", "u-1");
  });
});
