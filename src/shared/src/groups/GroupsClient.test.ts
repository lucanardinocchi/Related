import type { SupabaseClient } from "@supabase/supabase-js";
import { GroupsClient } from "./GroupsClient";

/**
 * Thin mock of the postgrest query-builder chain GroupsClient calls.
 * Each test plugs in the chain it needs — the mock just records the calls.
 */
type Resolved<T> =
  | Promise<{ data: T; error: null }>
  | Promise<{ data: null; error: { message: string } }>;

function makeQueryMock() {
  const single = jest.fn<Resolved<unknown>, []>();
  const order = jest.fn();
  const eq = jest.fn(() => ({ single, order }));
  const select = jest.fn(() => ({ single, order, eq }));
  const insert = jest.fn(() => ({ select }));
  const from = jest.fn((_table: string) => ({ insert, select }));
  const rpc = jest.fn();
  return { from, insert, select, single, order, eq, rpc };
}

function withClient() {
  const q = makeQueryMock();
  const supa = { from: q.from, rpc: q.rpc } as unknown as SupabaseClient;
  return { q, groups: new GroupsClient(supa) };
}

describe("GroupsClient.createGroup", () => {
  it("inserts a Group and returns the persisted row", async () => {
    const { q, groups } = withClient();
    q.single.mockResolvedValue({
      data: {
        id: "g-1",
        name: "college friends",
        created_at: "2026-05-18T00:00:00Z",
      },
      error: null,
    });

    const group = await groups.createGroup({ name: "college friends" });

    expect(group).toEqual({
      id: "g-1",
      name: "college friends",
      createdAt: "2026-05-18T00:00:00Z",
    });
    expect(q.from).toHaveBeenCalledWith("groups");
    expect(q.insert).toHaveBeenCalledWith({ name: "college friends" });
  });

  it("throws when the insert fails", async () => {
    const { q, groups } = withClient();
    q.single.mockResolvedValue({
      data: null,
      error: { message: "row violates RLS" },
    });

    await expect(groups.createGroup({ name: "x" })).rejects.toMatchObject({
      message: "row violates RLS",
    });
  });
});

describe("GroupsClient.addMember", () => {
  it("calls add_group_member RPC with the contact and group ids", async () => {
    const { q, groups } = withClient();
    q.rpc.mockResolvedValue({ data: null, error: null });

    await groups.addMember({ groupId: "g-1", contactId: "c-1" });

    expect(q.rpc).toHaveBeenCalledWith("add_group_member", {
      p_group_id: "g-1",
      p_contact_id: "c-1",
    });
  });

  it("throws when the RPC fails", async () => {
    const { q, groups } = withClient();
    q.rpc.mockResolvedValue({
      data: null,
      error: { message: "cross-user link rejected" },
    });

    await expect(
      groups.addMember({ groupId: "g-1", contactId: "c-1" }),
    ).rejects.toMatchObject({ message: "cross-user link rejected" });
  });
});

describe("GroupsClient.listForContact", () => {
  it("returns the Group Relationships a given Contact belongs to", async () => {
    const { q, groups } = withClient();
    // Chain: .from('contact_groups').select(cols).eq('contact_id', id).order(...)
    q.order.mockResolvedValue({
      data: [
        {
          group: {
            id: "g-1",
            name: "college friends",
            created_at: "2026-05-18T00:00:00Z",
            relationships: [
              { id: "r-college", created_at: "2026-05-18T00:00:00Z" },
            ],
          },
        },
      ],
      error: null,
    });

    const result = await groups.listForContact("c-sam");

    expect(q.from).toHaveBeenCalledWith("contact_groups");
    expect(q.eq).toHaveBeenCalledWith("contact_id", "c-sam");
    expect(result).toEqual([
      {
        id: "r-college",
        targetType: "group",
        createdAt: "2026-05-18T00:00:00Z",
        group: {
          id: "g-1",
          name: "college friends",
          createdAt: "2026-05-18T00:00:00Z",
        },
      },
    ]);
  });
});

describe("GroupsClient.listGroupRelationships", () => {
  it("returns Relationship rows hydrated with their Group target, newest first", async () => {
    const { q, groups } = withClient();
    q.order.mockResolvedValue({
      data: [
        {
          id: "r-2",
          target_type: "group",
          created_at: "2026-05-18T02:00:00Z",
          group: {
            id: "g-2",
            name: "running club",
            created_at: "2026-05-18T01:30:00Z",
          },
        },
        {
          id: "r-1",
          target_type: "group",
          created_at: "2026-05-18T01:00:00Z",
          group: {
            id: "g-1",
            name: "college friends",
            created_at: "2026-05-18T00:30:00Z",
          },
        },
      ],
      error: null,
    });

    const result = await groups.listGroupRelationships();

    expect(q.from).toHaveBeenCalledWith("relationships");
    expect(q.eq).toHaveBeenCalledWith("target_type", "group");
    expect(q.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result).toEqual([
      {
        id: "r-2",
        targetType: "group",
        createdAt: "2026-05-18T02:00:00Z",
        group: {
          id: "g-2",
          name: "running club",
          createdAt: "2026-05-18T01:30:00Z",
        },
      },
      {
        id: "r-1",
        targetType: "group",
        createdAt: "2026-05-18T01:00:00Z",
        group: {
          id: "g-1",
          name: "college friends",
          createdAt: "2026-05-18T00:30:00Z",
        },
      },
    ]);
  });
});

describe("GroupsClient.listGroups", () => {
  it("returns the signed-in User's Groups, newest first", async () => {
    const { q, groups } = withClient();
    q.order.mockResolvedValue({
      data: [
        {
          id: "g-2",
          name: "running club",
          created_at: "2026-05-18T02:00:00Z",
        },
        {
          id: "g-1",
          name: "college friends",
          created_at: "2026-05-18T01:00:00Z",
        },
      ],
      error: null,
    });

    const result = await groups.listGroups();

    expect(q.from).toHaveBeenCalledWith("groups");
    expect(q.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result).toEqual([
      {
        id: "g-2",
        name: "running club",
        createdAt: "2026-05-18T02:00:00Z",
      },
      {
        id: "g-1",
        name: "college friends",
        createdAt: "2026-05-18T01:00:00Z",
      },
    ]);
  });
});

describe("GroupsClient.listMembers", () => {
  it("returns the Group's member Contacts, hydrated", async () => {
    const { q, groups } = withClient();
    q.order.mockResolvedValue({
      data: [
        {
          contact: {
            id: "c-1",
            name: "Sam",
            phone: null,
            email: null,
            created_at: "2026-05-17T00:00:00Z",
          },
        },
        {
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

    const members = await groups.listMembers("g-1");

    expect(q.from).toHaveBeenCalledWith("contact_groups");
    expect(q.eq).toHaveBeenCalledWith("group_id", "g-1");
    expect(members).toEqual([
      {
        id: "c-1",
        name: "Sam",
        phone: null,
        email: null,
        createdAt: "2026-05-17T00:00:00Z",
      },
      {
        id: "c-2",
        name: "Jules",
        phone: "+61",
        email: "j@x.com",
        createdAt: "2026-05-17T00:30:00Z",
      },
    ]);
  });
});

describe("GroupsClient.removeMember", () => {
  it("calls remove_group_member RPC with the contact and group ids", async () => {
    const { q, groups } = withClient();
    q.rpc.mockResolvedValue({ data: null, error: null });

    await groups.removeMember({ groupId: "g-1", contactId: "c-1" });

    expect(q.rpc).toHaveBeenCalledWith("remove_group_member", {
      p_group_id: "g-1",
      p_contact_id: "c-1",
    });
  });
});
