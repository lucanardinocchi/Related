import type { SupabaseClient } from "@supabase/supabase-js";
import { InteractionsClient } from "./InteractionsClient";

type Resolved<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string } };

/**
 * Mock of the postgrest query-builder chain InteractionsClient drives for
 * `listForContact`: from(...).select(...).eq(...).order(...).
 */
function makeQueryMock() {
  const order = jest.fn<Promise<Resolved<unknown>>, []>();
  const eq = jest.fn(() => ({ order }));
  const select = jest.fn(() => ({ eq }));
  const from = jest.fn((_table: string) => ({ select }));
  const rpc = jest.fn<Promise<Resolved<unknown>>, [string, unknown]>();
  return { from, select, eq, order, rpc };
}

function withClient() {
  const q = makeQueryMock();
  const supa = { from: q.from, rpc: q.rpc } as unknown as SupabaseClient;
  return { q, client: new InteractionsClient(supa) };
}

describe("InteractionsClient.listForContact", () => {
  it("returns Interactions involving the Contact, sorted most-recent-first", async () => {
    const { q, client } = withClient();
    q.order.mockResolvedValue({
      data: [
        {
          id: "i-2",
          time: "2026-05-12T19:00:00Z",
          kind: "dinner",
          notes: "group dinner",
          status: "occurred",
          interaction_contacts: [
            { contact_id: "c-1", contacts: { name: "Sam" } },
          ],
        },
        {
          id: "i-1",
          time: "2026-05-10T09:00:00Z",
          kind: "coffee",
          notes: null,
          status: "occurred",
          interaction_contacts: [
            { contact_id: "c-1", contacts: { name: "Sam" } },
          ],
        },
      ],
      error: null,
    });

    const result = await client.listForContact("c-1");

    expect(q.from).toHaveBeenCalledWith("interactions");
    expect(q.eq).toHaveBeenCalledWith("interaction_contacts.contact_id", "c-1");
    expect(q.order).toHaveBeenCalledWith("time", { ascending: false });
    expect(result.map((r) => r.id)).toEqual(["i-2", "i-1"]);
    expect(result[0]).toMatchObject({
      kind: "dinner",
      status: "occurred",
      contacts: [{ id: "c-1", name: "Sam" }],
    });
  });

  it("returns an empty array when the Contact has no Interactions", async () => {
    const { q, client } = withClient();
    q.order.mockResolvedValue({ data: [], error: null });

    await expect(client.listForContact("c-1")).resolves.toEqual([]);
  });

  it("throws when the query fails", async () => {
    const { q, client } = withClient();
    q.order.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });

    await expect(client.listForContact("c-1")).rejects.toMatchObject({
      message: "permission denied",
    });
  });
});

describe("InteractionsClient.createInteraction — group mode", () => {
  it("forwards groupId to the RPC alongside contactIds", async () => {
    const { q, client } = withClient();
    q.rpc.mockResolvedValue({ data: "i-new", error: null });

    await client.createInteraction({
      time: "2026-05-10T19:00:00Z",
      kind: "dinner",
      status: "occurred",
      contactIds: [],
      groupId: "g-1",
    });

    expect(q.rpc).toHaveBeenCalledWith("create_interaction", {
      p_time: "2026-05-10T19:00:00Z",
      p_kind: "dinner",
      p_notes: null,
      p_status: "occurred",
      p_contact_ids: [],
      p_group_id: "g-1",
    });
  });

  it("omits the group_id parameter when groupId is not provided (1:1)", async () => {
    const { q, client } = withClient();
    q.rpc.mockResolvedValue({ data: "i-new", error: null });

    await client.createInteraction({
      time: "2026-05-10T09:00:00Z",
      kind: "coffee",
      status: "occurred",
      contactIds: ["c-1"],
    });

    // The 5-arg signature stays untouched — important so existing 1:1
    // callers don't accidentally start hitting the new overload.
    expect(q.rpc).toHaveBeenCalledWith("create_interaction", {
      p_time: "2026-05-10T09:00:00Z",
      p_kind: "coffee",
      p_notes: null,
      p_status: "occurred",
      p_contact_ids: ["c-1"],
    });
  });
});

describe("InteractionsClient.listForGroup", () => {
  it("returns Interactions logged in Group mode, most-recent-first", async () => {
    const { q, client } = withClient();
    q.order.mockResolvedValue({
      data: [
        {
          id: "i-2",
          time: "2026-05-12T19:00:00Z",
          kind: "dinner",
          notes: "group dinner",
          status: "occurred",
          interaction_contacts: [
            { contact_id: "c-1", contacts: { name: "Sam" } },
            { contact_id: "c-2", contacts: { name: "Jules" } },
          ],
        },
      ],
      error: null,
    });

    const result = await client.listForGroup("g-1");

    expect(q.from).toHaveBeenCalledWith("interactions");
    expect(q.eq).toHaveBeenCalledWith("group_id", "g-1");
    expect(q.order).toHaveBeenCalledWith("time", { ascending: false });
    expect(result).toEqual([
      {
        id: "i-2",
        time: "2026-05-12T19:00:00Z",
        kind: "dinner",
        notes: "group dinner",
        status: "occurred",
        contacts: [
          { id: "c-1", name: "Sam" },
          { id: "c-2", name: "Jules" },
        ],
      },
    ]);
  });
});
