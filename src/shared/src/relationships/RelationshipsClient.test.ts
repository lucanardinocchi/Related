import type { SupabaseClient } from "@supabase/supabase-js";
import { RelationshipsClient } from "./RelationshipsClient";

/**
 * Thin mock of the postgrest query-builder shape RelationshipsClient calls.
 * Each test sets up the chain it needs — the mock just records the call.
 */
type Resolved<T> = Promise<{ data: T; error: null } | { data: null; error: { message: string } }>;

function makeQueryMock() {
  // Chain shapes used by RelationshipsClient:
  //   from(t).insert(row).select(cols).single()                       — createContact
  //   from(t).update(patch).eq("id", id).select(cols).single()        — updateContact, updateRelationship
  //   from(t).delete().eq("id", id)                                   — deleteContact, deleteRelationship
  //   from(t).select(cols).eq("target_type","contact").order(col)     — listRelationships
  //   from(t).select(cols).eq("id", id).single()                      — getRelationship
  const single = jest.fn<Resolved<unknown>, []>();
  const order = jest.fn();
  const eqForUpdate = jest.fn(() => ({ select: jest.fn(() => ({ single })) }));
  const eqForDelete = jest.fn(() => Promise.resolve({ data: null, error: null }));
  const update = jest.fn(() => ({ eq: eqForUpdate }));
  const del = jest.fn(() => ({ eq: eqForDelete }));
  const select = jest.fn(() => ({ single, order }));
  const insert = jest.fn(() => ({ select }));
  const eq = jest.fn(() => ({ single, order }));
  const selectForList = jest.fn(() => ({ order, eq }));
  const from = jest.fn((_table: string) => ({
    insert,
    select: selectForList,
    update,
    delete: del,
  }));
  return {
    from,
    insert,
    select,
    single,
    order,
    eq,
    selectForList,
    update,
    del,
    eqForUpdate,
    eqForDelete,
  };
}

function withClient() {
  const q = makeQueryMock();
  const supa = { from: q.from } as unknown as SupabaseClient;
  return { q, rels: new RelationshipsClient(supa) };
}

const NULL_PROFILE = {
  birthday: null,
  area: null,
  occupation: null,
  education: null,
};

describe("RelationshipsClient.createContact", () => {
  it("inserts a Contact and returns the persisted row", async () => {
    const { q, rels } = withClient();
    q.single.mockResolvedValue({
      data: {
        id: "c-1",
        name: "Priya",
        phone: null,
        email: null,
        ...NULL_PROFILE,
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
      ...NULL_PROFILE,
      createdAt: "2026-05-17T00:00:00Z",
    });
    expect(q.from).toHaveBeenCalledWith("contacts");
    expect(q.insert).toHaveBeenCalledWith({
      name: "Priya",
      phone: null,
      email: null,
      ...NULL_PROFILE,
    });
  });

  it("forwards phone, email, and profile fields when provided", async () => {
    const { q, rels } = withClient();
    q.single.mockResolvedValue({
      data: {
        id: "c-2",
        name: "Jules",
        phone: "+61 400 000 000",
        email: "jules@example.com",
        birthday: "1990-04-12",
        area: "Surry Hills",
        occupation: "designer",
        education: "UNSW",
        created_at: "2026-05-17T00:00:00Z",
      },
      error: null,
    });

    await rels.createContact({
      name: "Jules",
      phone: "+61 400 000 000",
      email: "jules@example.com",
      birthday: "1990-04-12",
      area: "Surry Hills",
      occupation: "designer",
      education: "UNSW",
    });

    expect(q.insert).toHaveBeenCalledWith({
      name: "Jules",
      phone: "+61 400 000 000",
      email: "jules@example.com",
      birthday: "1990-04-12",
      area: "Surry Hills",
      occupation: "designer",
      education: "UNSW",
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

describe("RelationshipsClient.updateContact", () => {
  it("sends only the fields the caller specified", async () => {
    const { q, rels } = withClient();
    const single = jest.fn().mockResolvedValue({
      data: {
        id: "c-1",
        name: "Sam",
        phone: null,
        email: null,
        birthday: null,
        area: "Newtown",
        occupation: "lawyer",
        education: null,
        created_at: "2026-05-17T00:00:00Z",
      },
      error: null,
    });
    q.eqForUpdate.mockReturnValue({ select: jest.fn(() => ({ single })) });

    await rels.updateContact("c-1", { area: "Newtown", occupation: "lawyer" });

    expect(q.update).toHaveBeenCalledWith({
      area: "Newtown",
      occupation: "lawyer",
    });
    expect(q.eqForUpdate).toHaveBeenCalledWith("id", "c-1");
  });
});

describe("RelationshipsClient.deleteContact", () => {
  it("deletes by id", async () => {
    const { q, rels } = withClient();
    await rels.deleteContact("c-1");
    expect(q.del).toHaveBeenCalled();
    expect(q.eqForDelete).toHaveBeenCalledWith("id", "c-1");
  });
});

describe("RelationshipsClient.listRelationships", () => {
  it("filters to Contact-targeted Relationships server-side", async () => {
    // Group-targeted Relationships (auto-created by the groups trigger in
    // Slice 6) have contact=null and would crash the hydrator. The query
    // must filter them out at the database layer.
    const { q, rels } = withClient();
    q.order.mockResolvedValue({ data: [], error: null });

    await rels.listRelationships();

    expect(q.from).toHaveBeenCalledWith("relationships");
    expect(q.selectForList).toHaveBeenCalledWith(
      expect.stringContaining("contact:contacts"),
    );
    expect(q.eq).toHaveBeenCalledWith("target_type", "contact");
  });

  it("returns the signed-in User's Contact-targeted Relationships, hydrated", async () => {
    const { q, rels } = withClient();
    q.order.mockResolvedValue({
      data: [
        {
          id: "r-1",
          target_type: "contact",
          created_at: "2026-05-17T01:00:00Z",
          role: null,
          cadence: null,
          contact: {
            id: "c-1",
            name: "Sam",
            phone: null,
            email: null,
            ...NULL_PROFILE,
            created_at: "2026-05-17T00:00:00Z",
          },
        },
        {
          id: "r-2",
          target_type: "contact",
          created_at: "2026-05-17T02:00:00Z",
          role: "close friend",
          cadence: "weekly",
          contact: {
            id: "c-2",
            name: "Jules",
            phone: "+61",
            email: "j@x.com",
            birthday: "1990-01-01",
            area: "Newtown",
            occupation: "designer",
            education: null,
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
        role: null,
        cadence: null,
        contact: {
          id: "c-1",
          name: "Sam",
          phone: null,
          email: null,
          ...NULL_PROFILE,
          createdAt: "2026-05-17T00:00:00Z",
        },
      },
      {
        id: "r-2",
        targetType: "contact",
        createdAt: "2026-05-17T02:00:00Z",
        role: "close friend",
        cadence: "weekly",
        contact: {
          id: "c-2",
          name: "Jules",
          phone: "+61",
          email: "j@x.com",
          birthday: "1990-01-01",
          area: "Newtown",
          occupation: "designer",
          education: null,
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
        role: null,
        cadence: null,
        contact: {
          id: "c-7",
          name: "Maya",
          phone: null,
          email: "maya@x.com",
          ...NULL_PROFILE,
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
      role: null,
      cadence: null,
      contact: {
        id: "c-7",
        name: "Maya",
        phone: null,
        email: "maya@x.com",
        ...NULL_PROFILE,
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
