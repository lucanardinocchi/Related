import type { SupabaseClient } from "@supabase/supabase-js";
import { RelationshipContextClient } from "./RelationshipContextClient";

type Resolved<T> = { data: T; error: null } | { data: null; error: { message: string } };

function makeQueryMock() {
  const single = jest.fn<Promise<Resolved<unknown>>, []>();
  const maybeSingle = jest.fn<Promise<Resolved<unknown>>, []>();
  const order = jest.fn<Promise<Resolved<unknown>>, []>();
  const eq = jest.fn(() => ({ single, maybeSingle, order }));
  const select = jest.fn(() => ({ single, maybeSingle, order, eq }));
  const upsert = jest.fn(() => ({ select }));
  const deleteFn = jest.fn(() => ({ eq }));
  const from = jest.fn((_t: string) => ({
    select,
    upsert,
    delete: deleteFn,
  }));
  return { from, select, upsert, deleteFn, single, maybeSingle, order, eq };
}

function withClient() {
  const q = makeQueryMock();
  const supa = { from: q.from } as unknown as SupabaseClient;
  return {
    q,
    client: new RelationshipContextClient(supa, () => Promise.resolve("u-1")),
  };
}

describe("RelationshipContextClient", () => {
  it("getForRelationship returns null when no row exists", async () => {
    const { q, client } = withClient();
    q.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(client.getForRelationship("r-1")).resolves.toBeNull();
    expect(q.from).toHaveBeenCalledWith("relationship_context");
    expect(q.eq).toHaveBeenCalledWith("relationship_id", "r-1");
  });

  it("getForRelationship hydrates the row when one exists", async () => {
    const { q, client } = withClient();
    q.maybeSingle.mockResolvedValue({
      data: {
        id: "rc-1",
        relationship_id: "r-1",
        content: "Sam has been quiet this week.",
        source_chat_id: "c-1",
        created_at: "2026-05-19",
        updated_at: "2026-05-21",
      },
      error: null,
    });

    const ctx = await client.getForRelationship("r-1");
    expect(ctx).toEqual({
      id: "rc-1",
      relationshipId: "r-1",
      content: "Sam has been quiet this week.",
      sourceChatId: "c-1",
      createdAt: "2026-05-19",
      updatedAt: "2026-05-21",
    });
  });

  it("upsert replaces by relationship_id (singleton constraint)", async () => {
    const { q, client } = withClient();
    q.single.mockResolvedValue({
      data: {
        id: "rc-1",
        relationship_id: "r-1",
        content: "New narrative.",
        source_chat_id: "c-1",
        created_at: "2026-05-21",
        updated_at: "2026-05-21",
      },
      error: null,
    });

    const result = await client.upsert("r-1", "New narrative.", "c-1");

    expect(q.upsert).toHaveBeenCalledWith(
      {
        owner_id: "u-1",
        relationship_id: "r-1",
        content: "New narrative.",
        source_chat_id: "c-1",
      },
      { onConflict: "relationship_id" },
    );
    expect(result.content).toBe("New narrative.");
    expect(result.relationshipId).toBe("r-1");
  });

  it("upsert defaults source_chat_id to null when omitted", async () => {
    const { q, client } = withClient();
    q.single.mockResolvedValue({
      data: {
        id: "rc-1",
        relationship_id: "r-1",
        content: "User edit.",
        source_chat_id: null,
        created_at: "2026-05-21",
        updated_at: "2026-05-21",
      },
      error: null,
    });

    await client.upsert("r-1", "User edit.");

    expect(q.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ source_chat_id: null }),
      expect.any(Object),
    );
  });

  it("listAll returns rows newest-first", async () => {
    const { q, client } = withClient();
    q.order.mockResolvedValue({
      data: [
        {
          id: "rc-2",
          relationship_id: "r-2",
          content: "B",
          source_chat_id: null,
          created_at: "2026-05-20",
          updated_at: "2026-05-21",
        },
        {
          id: "rc-1",
          relationship_id: "r-1",
          content: "A",
          source_chat_id: null,
          created_at: "2026-05-10",
          updated_at: "2026-05-20",
        },
      ],
      error: null,
    });

    const rows = await client.listAll();
    expect(rows.map((r) => r.content)).toEqual(["B", "A"]);
  });

  it("deleteForRelationship removes by relationship_id", async () => {
    const { q, client } = withClient();
    q.eq.mockReturnValue({
      single: q.single,
    } as never);
    q.single.mockResolvedValue({ data: null, error: null });

    await client.deleteForRelationship("r-1");

    expect(q.deleteFn).toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith("relationship_id", "r-1");
  });

  it("surfaces Supabase errors verbatim", async () => {
    const { q, client } = withClient();
    q.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "rls denied" },
    });

    await expect(client.getForRelationship("r-1")).rejects.toMatchObject({
      message: "rls denied",
    });
  });
});
