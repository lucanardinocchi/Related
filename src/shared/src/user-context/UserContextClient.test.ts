import type { SupabaseClient } from "@supabase/supabase-js";
import { UserContextClient } from "./UserContextClient";

type Resolved<T> = { data: T; error: null } | { data: null; error: { message: string } };

function makeQueryMock() {
  const single = jest.fn<Promise<Resolved<unknown>>, []>();
  const maybeSingle = jest.fn<Promise<Resolved<unknown>>, []>();
  const order = jest.fn<Promise<Resolved<unknown>>, []>();
  const eq = jest.fn(() => ({ single, maybeSingle, order, eq: eqInner }));
  const eqInner = jest.fn(() => ({ single, maybeSingle }));
  const select = jest.fn(() => ({ single, maybeSingle, order, eq }));
  const insert = jest.fn(() => ({ select }));
  const update = jest.fn(() => ({ eq }));
  const upsert = jest.fn(() => ({ select }));
  const deleteFn = jest.fn(() => ({ eq }));
  const from = jest.fn((_t: string) => ({
    select,
    insert,
    update,
    upsert,
    delete: deleteFn,
  }));
  return { from, select, insert, update, upsert, deleteFn, single, maybeSingle, order, eq, eqInner };
}

function withClient() {
  const q = makeQueryMock();
  const supa = { from: q.from } as unknown as SupabaseClient;
  return { q, client: new UserContextClient(supa, () => Promise.resolve("u-1")) };
}

describe("UserContextClient — Goals & Values", () => {
  it("listGoals returns the User's goals newest-first", async () => {
    const { q, client } = withClient();
    q.order.mockResolvedValue({
      data: [
        { id: "g-2", content: "B", created_at: "2026-05-02", updated_at: "2026-05-02" },
        { id: "g-1", content: "A", created_at: "2026-05-01", updated_at: "2026-05-01" },
      ],
      error: null,
    });

    const result = await client.listGoals();
    expect(q.from).toHaveBeenCalledWith("goals_and_values");
    expect(result.map((r) => r.content)).toEqual(["B", "A"]);
  });

  it("addGoal inserts a row tagged with the resolved owner_id", async () => {
    const { q, client } = withClient();
    q.single.mockResolvedValue({
      data: { id: "g-new", content: "Be present", created_at: "2026-05-19", updated_at: "2026-05-19" },
      error: null,
    });

    const g = await client.addGoal("Be present");
    expect(q.insert).toHaveBeenCalledWith({
      owner_id: "u-1",
      content: "Be present",
    });
    expect(g).toEqual({
      id: "g-new",
      content: "Be present",
      createdAt: "2026-05-19",
      updatedAt: "2026-05-19",
    });
  });

  it("updateGoal rewrites the content for a single id", async () => {
    const { q, client } = withClient();
    q.eq.mockReturnValue({ single: q.single } as never);
    q.single.mockResolvedValue({ data: null, error: null });

    await client.updateGoal("g-1", "Edited content");

    expect(q.update).toHaveBeenCalledWith({ content: "Edited content" });
    expect(q.eq).toHaveBeenCalledWith("id", "g-1");
  });

  it("deleteGoal removes by id", async () => {
    const { q, client } = withClient();
    q.eq.mockReturnValue({ single: q.single } as never);
    q.single.mockResolvedValue({ data: null, error: null });

    await client.deleteGoal("g-1");
    expect(q.deleteFn).toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith("id", "g-1");
  });
});

describe("UserContextClient — Situational State", () => {
  it("getSituationalState returns null when none exists", async () => {
    const { q, client } = withClient();
    q.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(client.getSituationalState()).resolves.toBeNull();
  });

  it("getSituationalState hydrates the row when one exists", async () => {
    const { q, client } = withClient();
    q.maybeSingle.mockResolvedValue({
      data: {
        id: "s-1",
        content: "Just moved to Sydney",
        created_at: "2026-05-10",
        updated_at: "2026-05-19",
      },
      error: null,
    });

    const state = await client.getSituationalState();
    expect(state).toEqual({
      id: "s-1",
      content: "Just moved to Sydney",
      createdAt: "2026-05-10",
      updatedAt: "2026-05-19",
    });
  });

  it("setSituationalState upserts by owner_id (singleton constraint)", async () => {
    const { q, client } = withClient();
    q.single.mockResolvedValue({
      data: {
        id: "s-new",
        content: "Just moved to Sydney",
        created_at: "2026-05-19",
        updated_at: "2026-05-19",
      },
      error: null,
    });

    await client.setSituationalState("Just moved to Sydney");

    expect(q.upsert).toHaveBeenCalledWith(
      { owner_id: "u-1", content: "Just moved to Sydney" },
      { onConflict: "owner_id" },
    );
  });
});
