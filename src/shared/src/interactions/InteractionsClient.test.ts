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
  return { from, select, eq, order };
}

function withClient() {
  const q = makeQueryMock();
  const supa = { from: q.from } as unknown as SupabaseClient;
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
