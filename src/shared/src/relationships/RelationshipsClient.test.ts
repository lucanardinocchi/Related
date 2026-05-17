import type { SupabaseClient } from "@supabase/supabase-js";
import { RelationshipsClient } from "./RelationshipsClient";

/**
 * Thin mock of the postgrest query-builder shape RelationshipsClient calls.
 * Each test sets up the chain it needs — the mock just records the call.
 */
type Resolved<T> = Promise<{ data: T; error: null } | { data: null; error: { message: string } }>;

function makeQueryMock() {
  // The full chain shape we'll need: from(table).insert(row).select().single()
  // and from(table).select(cols).order(col).
  const single = jest.fn<Resolved<unknown>, []>();
  const order = jest.fn();
  const select = jest.fn(() => ({ single, order }));
  const insert = jest.fn(() => ({ select }));
  const eq = jest.fn(() => ({ single }));
  const selectForList = jest.fn(() => ({ order, eq }));
  const from = jest.fn((_table: string) => ({
    insert,
    select: selectForList,
  }));
  return { from, insert, select, single, order, eq, selectForList };
}

function withClient() {
  const q = makeQueryMock();
  const supa = { from: q.from } as unknown as SupabaseClient;
  return { q, rels: new RelationshipsClient(supa) };
}

describe("RelationshipsClient.createContact", () => {
  it("inserts a Contact and returns the persisted row", async () => {
    const { q, rels } = withClient();
    q.single.mockResolvedValue({
      data: {
        id: "c-1",
        name: "Priya",
        phone: null,
        email: null,
        created_at: "2026-05-17T00:00:00Z",
      },
      error: null,
    });

    const contact = await rels.createContact({ name: "Priya" });

    expect(contact).toEqual({
      id: "c-1",
      name: "Priya",
      phone: null,
      email: null,
      createdAt: "2026-05-17T00:00:00Z",
    });
    expect(q.from).toHaveBeenCalledWith("contacts");
    expect(q.insert).toHaveBeenCalledWith({
      name: "Priya",
      phone: null,
      email: null,
    });
  });

  it("forwards phone and email channels when provided", async () => {
    const { q, rels } = withClient();
    q.single.mockResolvedValue({
      data: {
        id: "c-2",
        name: "Jules",
        phone: "+61 400 000 000",
        email: "jules@example.com",
        created_at: "2026-05-17T00:00:00Z",
      },
      error: null,
    });

    await rels.createContact({
      name: "Jules",
      phone: "+61 400 000 000",
      email: "jules@example.com",
    });

    expect(q.insert).toHaveBeenCalledWith({
      name: "Jules",
      phone: "+61 400 000 000",
      email: "jules@example.com",
    });
  });

  it("throws when the insert fails", async () => {
    const { q, rels } = withClient();
    q.single.mockResolvedValue({
      data: null,
      error: { message: "row violates RLS" },
    });

    await expect(rels.createContact({ name: "X" })).rejects.toMatchObject({
      message: "row violates RLS",
    });
  });
});

describe("RelationshipsClient.listRelationships", () => {
  it("returns the signed-in User's Contact-targeted Relationships, hydrated", async () => {
    const { q, rels } = withClient();
    q.order.mockResolvedValue({
      data: [
        {
          id: "r-1",
          target_type: "contact",
          created_at: "2026-05-17T01:00:00Z",
          contact: {
            id: "c-1",
            name: "Sam",
            phone: null,
            email: null,
            created_at: "2026-05-17T00:00:00Z",
          },
        },
        {
          id: "r-2",
          target_type: "contact",
          created_at: "2026-05-17T02:00:00Z",
          contact: {
            id: "c-2",
            name: "Jules",
            phone: "+61",
            email: "j@x.com",
            created_at: "2026-05-17T00:30:00Z",
          },
        },
      ],
      error: null,
    });

    const result = await rels.listRelationships();

    expect(q.from).toHaveBeenCalledWith("relationships");
    expect(q.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result).toEqual([
      {
        id: "r-1",
        targetType: "contact",
        createdAt: "2026-05-17T01:00:00Z",
        contact: {
          id: "c-1",
          name: "Sam",
          phone: null,
          email: null,
          createdAt: "2026-05-17T00:00:00Z",
        },
      },
      {
        id: "r-2",
        targetType: "contact",
        createdAt: "2026-05-17T02:00:00Z",
        contact: {
          id: "c-2",
          name: "Jules",
          phone: "+61",
          email: "j@x.com",
          createdAt: "2026-05-17T00:30:00Z",
        },
      },
    ]);
  });

  it("returns an empty array when the User has no Relationships", async () => {
    const { q, rels } = withClient();
    q.order.mockResolvedValue({ data: [], error: null });

    await expect(rels.listRelationships()).resolves.toEqual([]);
  });
});

describe("RelationshipsClient.getRelationship", () => {
  it("returns one hydrated Relationship by id", async () => {
    const { q, rels } = withClient();
    q.single.mockResolvedValue({
      data: {
        id: "r-7",
        target_type: "contact",
        created_at: "2026-05-17T03:00:00Z",
        contact: {
          id: "c-7",
          name: "Maya",
          phone: null,
          email: "maya@x.com",
          created_at: "2026-05-17T03:00:00Z",
        },
      },
      error: null,
    });

    const result = await rels.getRelationship("r-7");

    expect(q.from).toHaveBeenCalledWith("relationships");
    expect(q.eq).toHaveBeenCalledWith("id", "r-7");
    expect(result).toEqual({
      id: "r-7",
      targetType: "contact",
      createdAt: "2026-05-17T03:00:00Z",
      contact: {
        id: "c-7",
        name: "Maya",
        phone: null,
        email: "maya@x.com",
        createdAt: "2026-05-17T03:00:00Z",
      },
    });
  });

  it("throws when the lookup fails", async () => {
    const { q, rels } = withClient();
    q.single.mockResolvedValue({
      data: null,
      error: { message: "No rows" },
    });

    await expect(rels.getRelationship("nope")).rejects.toMatchObject({
      message: "No rows",
    });
  });
});
