import type { SupabaseClient } from "@supabase/supabase-js";
import { UserContextBuilder } from "./UserContextBuilder";

type Resolved<T> = { data: T; error: null } | { data: null; error: { message: string } };

function makeQueryMock(
  tableData: Record<string, unknown> = {},
  tableLimitData: Record<string, unknown> = {},
) {
  const emptyList = { data: [] as unknown[], error: null };

  function attachLimit<T>(promise: Promise<T>, limitFn: jest.Mock) {
    return Object.assign(promise, { limit: limitFn });
  }

  const maybeSingle = jest.fn<Promise<Resolved<unknown>>, []>();
  const limit = jest.fn<Promise<Resolved<unknown>>, []>().mockResolvedValue(
    tableLimitData
      ? emptyList
      : emptyList,
  );
  const order = jest.fn(() =>
    attachLimit(
      Promise.resolve(
        tableData
          ? { data: Object.values(tableData)[0], error: null }
          : emptyList,
      ),
      limit,
    ),
  );

  const from = jest.fn((table: string) => {
    const tableLimit = jest.fn<Promise<Resolved<unknown>>, []>().mockResolvedValue(
      tableLimitData[table] !== undefined
        ? { data: tableLimitData[table], error: null }
        : emptyList,
    );
    const tableOrder = jest.fn(() =>
      attachLimit(
        Promise.resolve(
          tableData[table] !== undefined
            ? { data: tableData[table], error: null }
            : emptyList,
        ),
        tableLimit,
      ),
    );
    const select = jest.fn(() => ({ order: tableOrder, maybeSingle, limit: tableLimit }));
    return { select };
  });

  return { from, maybeSingle };
}

describe("UserContextBuilder.buildUserContext", () => {
  it("returns the empty snapshot when no supabase client is wired", async () => {
    const builder = new UserContextBuilder();
    const snapshot = await builder.buildUserContext(
      "u-1",
      new Date("2026-05-19T00:00:00Z"),
    );

    expect(snapshot).toEqual({
      userId: "u-1",
      asOf: "2026-05-19T00:00:00.000Z",
      situationalState: null,
      goalsAndValues: [],
      operatorStrengths: [],
    });
  });

  it("populates Goals & Values and Situational State when a supabase client is wired", async () => {
    const q = makeQueryMock({
      goals_and_values: [
        {
          id: "g-1",
          content: "Be more present with family",
          created_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-01T00:00:00Z",
        },
      ],
    });
    q.maybeSingle.mockResolvedValue({
      data: {
        id: "ss-1",
        content: "Just moved to Sydney",
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-19T00:00:00Z",
      },
      error: null,
    });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const builder = new UserContextBuilder({ supabase: supa });
    const snapshot = await builder.buildUserContext(
      "u-1",
      new Date("2026-05-19T01:00:00Z"),
    );

    expect(snapshot.goalsAndValues).toHaveLength(1);
    expect(snapshot.situationalState?.content).toBe("Just moved to Sydney");
    expect(q.from).toHaveBeenCalledWith("goals_and_values");
    expect(q.from).toHaveBeenCalledWith("situational_state");
  });

  it("populates Operator Strengths from operator_strengths when rows exist", async () => {
    const q = makeQueryMock({
      operator_strengths: [
        {
          id: "os-1",
          content: "AI/ML expertise",
          created_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-01T00:00:00Z",
        },
      ],
    });
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const builder = new UserContextBuilder({ supabase: supa });
    const snapshot = await builder.buildUserContext("u-1", new Date());

    expect(snapshot.operatorStrengths).toEqual([
      {
        id: "os-1",
        content: "AI/ML expertise",
        createdAt: "2026-05-01T00:00:00Z",
        updatedAt: "2026-05-01T00:00:00Z",
      },
    ]);
    expect(q.from).toHaveBeenCalledWith("operator_strengths");
  });
});
