import type { SupabaseClient } from "@supabase/supabase-js";
import { UserContextBuilder } from "./UserContextBuilder";

type Resolved<T> = { data: T; error: null } | { data: null; error: { message: string } };

function makeQueryMock() {
  const order = jest.fn<Promise<Resolved<unknown>>, []>();
  const maybeSingle = jest.fn<Promise<Resolved<unknown>>, []>();
  const select = jest.fn(() => ({ order, maybeSingle }));
  const from = jest.fn((_t: string) => ({ select }));
  return { from, select, order, maybeSingle };
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

  it("tolerates a User with no Goals or Situational State (empty arrays)", async () => {
    const q = makeQueryMock();
    q.order.mockResolvedValue({ data: [], error: null });
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const builder = new UserContextBuilder({ supabase: supa });
    const snapshot = await builder.buildUserContext("u-1", new Date());

    expect(snapshot.goalsAndValues).toEqual([]);
    expect(snapshot.situationalState).toEqual([]);
  });
});
