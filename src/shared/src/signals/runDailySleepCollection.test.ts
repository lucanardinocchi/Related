import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeSleepFetcher } from "./FakeSleepFetcher";
import { runDailySleepCollection } from "./runDailySleepCollection";

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

describe("runDailySleepCollection", () => {
  it("returns recordsWritten + windowStart for an iOS-style fetcher", async () => {
    const fetcher = new FakeSleepFetcher([
      {
        id: "hk-1",
        startedAt: "2026-05-18T22:00:00Z",
        endedAt: "2026-05-19T06:00:00Z",
        durationMinutes: 480,
        quality: "deep",
      },
      {
        id: "hk-2",
        startedAt: "2026-05-17T22:00:00Z",
        endedAt: "2026-05-18T06:00:00Z",
        durationMinutes: 460,
        quality: null,
      },
    ]);
    const q = makeQueryMock();
    q.upsertResolve.mockResolvedValue({ data: null, error: null });
    q.deleteNot.mockResolvedValue({ data: null, error: null });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const result = await runDailySleepCollection({
      supabase: supa,
      fetcher: fetcher.fetch,
      ownerId: "u-1",
      asOf: new Date("2026-05-19T10:00:00Z"),
    });

    expect(result.recordsWritten).toBe(2);
    // 3-day rolling window — same as the summariser.
    expect(result.windowStart).toBe("2026-05-16T10:00:00.000Z");
    expect(q.from).toHaveBeenCalledWith("inferred_signal_sleep");
    expect(q.upsert).toHaveBeenCalledTimes(1);
  });

  it("is idempotent — calling twice with the same fetcher upserts the same rows", async () => {
    const fetcher = new FakeSleepFetcher([
      {
        id: "hk-1",
        startedAt: "2026-05-18T22:00:00Z",
        endedAt: "2026-05-19T06:00:00Z",
        durationMinutes: 480,
        quality: "deep",
      },
    ]);
    const q = makeQueryMock();
    q.upsertResolve.mockResolvedValue({ data: null, error: null });
    q.deleteNot.mockResolvedValue({ data: null, error: null });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const r1 = await runDailySleepCollection({
      supabase: supa,
      fetcher: fetcher.fetch,
      ownerId: "u-1",
      asOf: new Date("2026-05-19T10:00:00Z"),
    });
    const r2 = await runDailySleepCollection({
      supabase: supa,
      fetcher: fetcher.fetch,
      ownerId: "u-1",
      asOf: new Date("2026-05-19T10:00:00Z"),
    });

    expect(r1.recordsWritten).toBe(1);
    expect(r2.recordsWritten).toBe(1);
    expect(q.upsert).toHaveBeenCalledTimes(2);
    // The collector uses onConflict on (owner_id, record_id) — the
    // DB rejects duplicates, but the driver returns the same shape.
    // (`upsert` is called as upsert(rows, { onConflict }).)
    expect(q.upsert).toHaveBeenCalledWith(
      expect.any(Array),
      { onConflict: "owner_id,record_id" },
    );
  });

  it("returns recordsWritten=0 when the fetcher returns nothing (clears window)", async () => {
    const fetcher = new FakeSleepFetcher();
    const q = makeQueryMock();
    q.upsertResolve.mockResolvedValue({ data: null, error: null });
    q.deleteNot.mockResolvedValue({ data: null, error: null });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const result = await runDailySleepCollection({
      supabase: supa,
      fetcher: fetcher.fetch,
      ownerId: "u-1",
      asOf: new Date("2026-05-19T10:00:00Z"),
    });

    expect(result.recordsWritten).toBe(0);
    expect(q.upsert).not.toHaveBeenCalled();
    // It still issued the GC delete so the window is cleared.
    expect(q.eq).toHaveBeenCalledWith("owner_id", "u-1");
  });
});
