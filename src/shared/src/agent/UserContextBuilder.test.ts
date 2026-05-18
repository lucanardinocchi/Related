import type { SupabaseClient } from "@supabase/supabase-js";
import { UserContextBuilder } from "./UserContextBuilder";

type Resolved<T> = { data: T; error: null } | { data: null; error: { message: string } };

function makeQueryMock() {
  const order = jest.fn<Promise<Resolved<unknown>>, []>();
  const maybeSingle = jest.fn<Promise<Resolved<unknown>>, []>();
  const lt = jest.fn<Promise<Resolved<unknown>>, []>();
  const lte = jest.fn<Promise<Resolved<unknown>>, []>();
  const gt = jest.fn<Promise<Resolved<unknown>>, []>();
  const eq = jest.fn(() => ({ gt }));
  const gte = jest.fn(() => ({ lt, lte, order }));
  const select = jest.fn(() => ({ order, maybeSingle, gte, eq }));
  const from = jest.fn((_t: string) => ({ select }));
  return { from, select, order, maybeSingle, gte, lt, lte, gt, eq };
}

describe("UserContextBuilder.buildUserContext — Slice 10", () => {
  it("returns the empty snapshot when no supabase client is wired", async () => {
    // Backwards-compat: the Slice 7 constructor took no args and produced
    // the empty snapshot. We keep that path so callers that haven't been
    // migrated still compile and produce a sensible (if minimal) result.
    const builder = new UserContextBuilder();
    const snapshot = await builder.buildUserContext("u-1", new Date("2026-05-19T00:00:00Z"));

    expect(snapshot).toEqual({
      userId: "u-1",
      asOf: "2026-05-19T00:00:00.000Z",
      transientIntent: [],
      situationalState: [],
      goalsAndValues: [],
      inferredSignals: { calendarDensity: null, sleep: null },
    });
  });

  it("populates Goals & Values and Situational State when a supabase client is wired", async () => {
    const q = makeQueryMock();
    q.order.mockResolvedValue({
      data: [
        { content: "Be more present with family" },
        { content: "Move slow, build deep relationships" },
      ],
      error: null,
    });
    q.maybeSingle.mockResolvedValue({
      data: { content: "Just moved to Sydney", updated_at: "2026-05-19T00:00:00Z" },
      error: null,
    });
    q.lte.mockResolvedValue({ data: [], error: null });
    q.lt.mockResolvedValue({ data: [], error: null });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const builder = new UserContextBuilder({ supabase: supa });
    const snapshot = await builder.buildUserContext("u-1", new Date("2026-05-19T01:00:00Z"));

    expect(snapshot.goalsAndValues).toEqual([
      "Be more present with family",
      "Move slow, build deep relationships",
    ]);
    expect(snapshot.situationalState).toEqual(["Just moved to Sydney"]);
    expect(q.from).toHaveBeenCalledWith("goals_and_values");
    expect(q.from).toHaveBeenCalledWith("situational_state");
  });

  it("populates calendar density from inferred_signal_calendar when events exist", async () => {
    const q = makeQueryMock();
    q.order.mockResolvedValue({ data: [], error: null });
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    q.lte.mockResolvedValue({ data: [], error: null });
    q.lt.mockResolvedValue({
      data: [
        {
          event_id: "evt-1",
          title: "Coffee",
          start: "2026-05-19T10:00:00Z",
          end: "2026-05-19T11:00:00Z",
          is_all_day: false,
        },
      ],
      error: null,
    });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const builder = new UserContextBuilder({ supabase: supa });
    const snapshot = await builder.buildUserContext(
      "u-1",
      new Date("2026-05-19T08:00:00Z"),
    );

    expect(snapshot.inferredSignals.calendarDensity).toEqual(
      expect.objectContaining({ density: 1, bucket: "light" }),
    );
    expect(q.from).toHaveBeenCalledWith("inferred_signal_calendar");
  });

  it("calendar density is null when no events are present (graceful degradation)", async () => {
    const q = makeQueryMock();
    q.order.mockResolvedValue({ data: [], error: null });
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    q.lte.mockResolvedValue({ data: [], error: null });
    q.lt.mockResolvedValue({ data: [], error: null });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const builder = new UserContextBuilder({ supabase: supa });
    const snapshot = await builder.buildUserContext("u-1", new Date());
    expect(snapshot.inferredSignals.calendarDensity).toBeNull();
  });

  it("populates sleep signal from inferred_signal_sleep when records exist", async () => {
    const q = makeQueryMock();
    q.order.mockResolvedValue({ data: [], error: null });
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    q.lt.mockResolvedValue({ data: [], error: null });
    q.lte.mockResolvedValue({
      data: [
        {
          record_id: "hk-1",
          started_at: "2026-05-18T22:00:00Z",
          ended_at: "2026-05-19T06:00:00Z",
          duration_minutes: 480,
          quality: null,
        },
      ],
      error: null,
    });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const builder = new UserContextBuilder({ supabase: supa });
    const snapshot = await builder.buildUserContext(
      "u-1",
      new Date("2026-05-19T08:00:00Z"),
    );

    expect(snapshot.inferredSignals.sleep).toEqual(
      expect.objectContaining({ nights: 1, averageHours: 8, bucket: "well_rested" }),
    );
    expect(q.from).toHaveBeenCalledWith("inferred_signal_sleep");
  });

  it("sleep is null when no records exist (graceful degradation)", async () => {
    const q = makeQueryMock();
    q.order.mockResolvedValue({ data: [], error: null });
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    q.lt.mockResolvedValue({ data: [], error: null });
    q.lte.mockResolvedValue({ data: [], error: null });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const builder = new UserContextBuilder({ supabase: supa });
    const snapshot = await builder.buildUserContext("u-1", new Date());
    expect(snapshot.inferredSignals.sleep).toBeNull();
  });

  it("includes Transient Intent only when mode='engaged' AND a sessionId is provided", async () => {
    const q = makeQueryMock();
    q.order.mockResolvedValue({ data: [], error: null });
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    q.lt.mockResolvedValue({ data: [], error: null });
    q.lte.mockResolvedValue({ data: [], error: null });
    q.gt.mockResolvedValue({
      data: [{ content: "plan my birthday" }],
      error: null,
    });
    const supa = { from: q.from } as unknown as SupabaseClient;
    const builder = new UserContextBuilder({ supabase: supa });

    const engaged = await builder.buildUserContext("u-1", new Date(), {
      mode: "engaged",
      sessionId: "sess-1",
    });
    expect(engaged.transientIntent).toEqual(["plan my birthday"]);
    expect(q.from).toHaveBeenCalledWith("transient_intent");
    expect(q.eq).toHaveBeenCalledWith("session_id", "sess-1");

    // Baseline / Triggered Passes must not see Transient Intent even when
    // rows exist for the User — it's session-scoped by design.
    const baseline = await builder.buildUserContext("u-1", new Date(), {
      mode: "baseline",
    });
    expect(baseline.transientIntent).toEqual([]);
  });

  it("tolerates a User with no Goals or Situational State (empty arrays)", async () => {
    const q = makeQueryMock();
    q.order.mockResolvedValue({ data: [], error: null });
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    q.lte.mockResolvedValue({ data: [], error: null });
    q.lt.mockResolvedValue({ data: [], error: null });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const builder = new UserContextBuilder({ supabase: supa });
    const snapshot = await builder.buildUserContext("u-1", new Date());

    expect(snapshot.goalsAndValues).toEqual([]);
    expect(snapshot.situationalState).toEqual([]);
  });
});
