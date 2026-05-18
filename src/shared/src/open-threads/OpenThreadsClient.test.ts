import type { SupabaseClient } from "@supabase/supabase-js";
import { OpenThreadsClient } from "./OpenThreadsClient";

type Resolved<T> = Promise<{ data: T; error: null } | { data: null; error: { message: string } }>;

/**
 * Thin mock of the postgrest query-builder shape OpenThreadsClient drives.
 * Each test wires the chain it needs — the mock only records the call.
 */
function makeQueryMock() {
  const single = jest.fn<Resolved<unknown>, []>();
  const order = jest.fn<Resolved<unknown>, []>();
  const update = jest.fn(() => ({ eq }));
  const eq = jest.fn(() => ({ select: jest.fn(() => ({ single })) }));
  const select = jest.fn(() => ({ order, eq }));
  const from = jest.fn((_table: string) => ({ select, update }));
  const rpc = jest.fn();
  return { from, select, order, eq, single, update, rpc };
}

function withClient() {
  const q = makeQueryMock();
  const supa = { from: q.from, rpc: q.rpc } as unknown as SupabaseClient;
  return { q, client: new OpenThreadsClient(supa) };
}

describe("OpenThreadsClient.createOpenThread", () => {
  it("calls the create_open_thread RPC and returns the inserted id", async () => {
    const { q, client } = withClient();
    q.rpc.mockResolvedValue({ data: "ot-1", error: null });

    const id = await client.createOpenThread({
      description: "owe Sam a coffee",
      direction: "me_owes_them",
      relationshipIds: ["r-1", "r-2"],
    });

    expect(id).toBe("ot-1");
    expect(q.rpc).toHaveBeenCalledWith("create_open_thread", {
      p_description: "owe Sam a coffee",
      p_direction: "me_owes_them",
      p_relationship_ids: ["r-1", "r-2"],
    });
  });

  it("throws when the RPC errors", async () => {
    const { q, client } = withClient();
    q.rpc.mockResolvedValue({
      data: null,
      error: { message: "row violates RLS" },
    });

    await expect(
      client.createOpenThread({
        description: "x",
        direction: "they_owe_me",
        relationshipIds: ["r-1"],
      }),
    ).rejects.toMatchObject({ message: "row violates RLS" });
  });
});

describe("OpenThreadsClient.closeOpenThread", () => {
  it("updates closed_at on the thread by id and returns void", async () => {
    const { q, client } = withClient();
    const select = jest.fn(() => ({ single: jest.fn().mockResolvedValue({ data: { id: "ot-1" }, error: null }) }));
    const eq = jest.fn(() => ({ select }));
    q.update.mockReturnValueOnce({ eq } as unknown as ReturnType<typeof q.update>);

    await client.closeOpenThread("ot-1");

    expect(q.from).toHaveBeenCalledWith("open_threads");
    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({ closed_at: expect.any(String) }),
    );
    expect(eq).toHaveBeenCalledWith("id", "ot-1");
  });

  it("throws when the update errors", async () => {
    const { q, client } = withClient();
    const select = jest.fn(() => ({ single: jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } }) }));
    const eq = jest.fn(() => ({ select }));
    q.update.mockReturnValueOnce({ eq } as unknown as ReturnType<typeof q.update>);

    await expect(client.closeOpenThread("ot-1")).rejects.toMatchObject({
      message: "boom",
    });
  });
});

describe("OpenThreadsClient.listOpenForUser", () => {
  it("returns the User's open threads with linked relationships, oldest-first", async () => {
    const { q, client } = withClient();
    q.order.mockResolvedValue({
      data: [
        {
          id: "ot-old",
          description: "ancient owed reply",
          direction: "me_owes_them",
          created_at: "2026-04-01T10:00:00Z",
          closed_at: null,
          open_thread_relationships: [
            { relationship_id: "r-1" },
            { relationship_id: "r-2" },
          ],
        },
        {
          id: "ot-new",
          description: "fresh thread",
          direction: "they_owe_me",
          created_at: "2026-05-01T10:00:00Z",
          closed_at: null,
          open_thread_relationships: [{ relationship_id: "r-3" }],
        },
      ],
      error: null,
    });

    const threads = await client.listOpenForUser();

    expect(q.from).toHaveBeenCalledWith("open_threads");
    expect(q.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(threads).toEqual([
      {
        id: "ot-old",
        description: "ancient owed reply",
        direction: "me_owes_them",
        createdAt: "2026-04-01T10:00:00Z",
        closedAt: null,
        relationshipIds: ["r-1", "r-2"],
      },
      {
        id: "ot-new",
        description: "fresh thread",
        direction: "they_owe_me",
        createdAt: "2026-05-01T10:00:00Z",
        closedAt: null,
        relationshipIds: ["r-3"],
      },
    ]);
  });

  it("returns [] when the User has no open threads", async () => {
    const { q, client } = withClient();
    q.order.mockResolvedValue({ data: [], error: null });

    await expect(client.listOpenForUser()).resolves.toEqual([]);
  });
});

describe("OpenThreadsClient.listOpenForRelationship", () => {
  it("filters open threads to those linked to a given relationship, oldest-first", async () => {
    const { q, client } = withClient();
    // listOpenForRelationship chains .from("open_threads").select(...).eq("...").order(...).
    // The query mock's `eq` returns `{ select }` but the real client wants
    // `eq` → `{ order }`. Rewire eq for this test.
    // listOpenForRelationship queries `open_thread_relationships` and joins
    // back to `open_threads`, so postgrest returns rows shaped as
    // `{ open_threads: {...} }` — that's what the inner order mock yields.
    const innerOrder = jest.fn().mockResolvedValue({
      data: [
        {
          open_threads: {
            id: "ot-1",
            description: "owed",
            direction: "me_owes_them",
            created_at: "2026-04-01T10:00:00Z",
            closed_at: null,
            open_thread_relationships: [{ relationship_id: "r-7" }],
          },
        },
      ],
      error: null,
    });
    const eq = jest.fn(() => ({ order: innerOrder }));
    q.select.mockReturnValueOnce({ eq } as unknown as ReturnType<typeof q.select>);

    const result = await client.listOpenForRelationship("r-7");

    expect(q.from).toHaveBeenCalledWith("open_thread_relationships");
    expect(eq).toHaveBeenCalledWith("relationship_id", "r-7");
    expect(innerOrder).toHaveBeenCalledWith("open_threads(created_at)", {
      ascending: true,
    });
    expect(result).toEqual([
      {
        id: "ot-1",
        description: "owed",
        direction: "me_owes_them",
        createdAt: "2026-04-01T10:00:00Z",
        closedAt: null,
        relationshipIds: ["r-7"],
      },
    ]);
  });
});

describe("OpenThreadsClient.closedPerDay", () => {
  it("calls the closed_threads_per_day RPC and shapes the rows", async () => {
    const { q, client } = withClient();
    q.rpc.mockResolvedValue({
      data: [
        { day: "2026-05-01", count: 0 },
        { day: "2026-05-02", count: 3 },
        { day: "2026-05-03", count: 1 },
      ],
      error: null,
    });

    const buckets = await client.closedPerDay({
      from: "2026-05-01",
      to: "2026-05-03",
    });

    expect(q.rpc).toHaveBeenCalledWith("closed_threads_per_day", {
      p_from: "2026-05-01",
      p_to: "2026-05-03",
    });
    expect(buckets).toEqual([
      { date: "2026-05-01", count: 0 },
      { date: "2026-05-02", count: 3 },
      { date: "2026-05-03", count: 1 },
    ]);
  });

  it("throws when the RPC errors", async () => {
    const { q, client } = withClient();
    q.rpc.mockResolvedValue({ data: null, error: { message: "nope" } });

    await expect(
      client.closedPerDay({ from: "2026-05-01", to: "2026-05-02" }),
    ).rejects.toMatchObject({ message: "nope" });
  });
});
