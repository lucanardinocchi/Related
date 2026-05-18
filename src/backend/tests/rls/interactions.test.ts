import {
  adminClient,
  setupTestUsers,
  teardownTestUsers,
  TestUser,
} from "../helpers/test-clients";

/**
 * Slice 4 — Interactions. An Interaction is one moment of contact between the
 * User and one or more Contacts; status is `planned` | `occurred` | `missed`.
 * Past and future use the same shape (the difference is `time` + `status`).
 *
 * Mirrors Slice 3's Open Threads suite: each test owns the rows it creates and
 * teardown wipes by owner.
 */
describe("Interactions — RLS + multi-Contact semantics", () => {
  let userA: TestUser;
  let userB: TestUser;
  let aContactId: string;

  beforeEach(async () => {
    [userA, userB] = await setupTestUsers(2);

    const { data: aContact, error: aErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Sam" })
      .select("id")
      .single();
    if (aErr || !aContact) throw new Error(aErr?.message ?? "no contact A");
    aContactId = aContact.id;

    const { error: bErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userB.id, name: "Priya" });
    if (bErr) throw new Error(bErr.message);
  });

  afterEach(async () => {
    const ids = [userA.id, userB.id];
    await adminClient.from("interaction_contacts").delete().in("owner_id", ids);
    await adminClient.from("interactions").delete().in("owner_id", ids);
    await adminClient.from("relationships").delete().in("owner_id", ids);
    await adminClient.from("contacts").delete().in("owner_id", ids);
    await teardownTestUsers([userA, userB]);
  });

  test("User A can create an Interaction and read it back with linked Contacts", async () => {
    const { data: id, error: rpcErr } = await userA.client.rpc(
      "create_interaction",
      {
        p_time: "2026-05-10T09:00:00Z",
        p_kind: "coffee",
        p_notes: "Sam's apartment",
        p_status: "occurred",
        p_contact_ids: [aContactId],
      },
    );
    expect(rpcErr).toBeNull();
    expect(typeof id).toBe("string");

    const { data: rows, error: readErr } = await userA.client
      .from("interactions")
      .select("id, kind, notes, status, time");
    expect(readErr).toBeNull();
    expect(rows).toEqual([
      expect.objectContaining({
        kind: "coffee",
        notes: "Sam's apartment",
        status: "occurred",
      }),
    ]);

    const { data: links, error: linksErr } = await userA.client
      .from("interaction_contacts")
      .select("contact_id");
    expect(linksErr).toBeNull();
    expect(links).toEqual([{ contact_id: aContactId }]);
  });

  test("a single Interaction links every Contact passed in — one record, many people", async () => {
    // Group dinner with Sam, Jules, Maya → one Interaction, three links.
    const { data: jules, error: jErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Jules" })
      .select("id")
      .single();
    if (jErr || !jules) throw new Error(jErr?.message);
    const { data: maya, error: mErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Maya" })
      .select("id")
      .single();
    if (mErr || !maya) throw new Error(mErr?.message);

    const { data: id, error: rpcErr } = await userA.client.rpc(
      "create_interaction",
      {
        p_time: "2026-05-12T19:00:00Z",
        p_kind: "dinner",
        p_notes: "group dinner",
        p_status: "occurred",
        p_contact_ids: [aContactId, jules.id, maya.id],
      },
    );
    expect(rpcErr).toBeNull();

    const { data: links } = await userA.client
      .from("interaction_contacts")
      .select("contact_id")
      .eq("interaction_id", id as string);
    expect(links).toHaveLength(3);
    expect(links!.map((l: any) => l.contact_id).sort()).toEqual(
      [aContactId, jules.id, maya.id].sort(),
    );
  });

  test("User A can mark a planned Interaction as missed; User B's update is blocked by RLS", async () => {
    const { data: id, error: rpcErr } = await userA.client.rpc(
      "create_interaction",
      {
        p_time: "2026-05-10T09:00:00Z",
        p_kind: "coffee",
        p_notes: null,
        p_status: "planned",
        p_contact_ids: [aContactId],
      },
    );
    expect(rpcErr).toBeNull();

    // User B's attempt: RLS hides the row → update affects nothing.
    const { data: bUpdate, error: bErr } = await userB.client
      .from("interactions")
      .update({ status: "missed" })
      .eq("id", id as string)
      .select("id");
    expect(bErr).toBeNull();
    expect(bUpdate).toEqual([]);

    // User A's attempt: the status flips to missed.
    const { error: aErr } = await userA.client
      .from("interactions")
      .update({ status: "missed" })
      .eq("id", id as string);
    expect(aErr).toBeNull();

    const { data: aView } = await userA.client
      .from("interactions")
      .select("status")
      .eq("id", id as string)
      .single();
    expect((aView as any)?.status).toBe("missed");
  });

  test("status CHECK rejects values other than planned / occurred / missed", async () => {
    const { error } = await adminClient.from("interactions").insert({
      owner_id: userA.id,
      time: "2026-05-10T09:00:00Z",
      kind: "coffee",
      status: "bogus",
    });
    expect(error).not.toBeNull();
  });

  test("User B cannot link an Interaction to User A's Contact via create_interaction", async () => {
    const { error } = await userB.client.rpc("create_interaction", {
      p_time: "2026-05-10T09:00:00Z",
      p_kind: "coffee",
      p_notes: "cross-user attack",
      p_status: "occurred",
      p_contact_ids: [aContactId],
    });
    expect(error).not.toBeNull();
  });

  test("an Interaction inserted directly without any linked Contact fails at commit", async () => {
    // Bypassing the RPC (e.g., a direct PostgREST insert) must still enforce
    // that every Interaction has at least one Contact. Schema-level, not just
    // RPC-level.
    const { error } = await adminClient.from("interactions").insert({
      owner_id: userA.id,
      time: "2026-05-10T09:00:00Z",
      kind: "coffee",
      status: "occurred",
    });
    expect(error).not.toBeNull();
  });

  test("create_interaction rejects an empty contact-ids array", async () => {
    const { error } = await userA.client.rpc("create_interaction", {
      p_time: "2026-05-10T09:00:00Z",
      p_kind: "coffee",
      p_notes: null,
      p_status: "occurred",
      p_contact_ids: [],
    });
    expect(error).not.toBeNull();
  });

  test("User B cannot see User A's Interactions or their Contact links", async () => {
    const { error: rpcErr } = await userA.client.rpc("create_interaction", {
      p_time: "2026-05-10T09:00:00Z",
      p_kind: "coffee",
      p_notes: "private to A",
      p_status: "occurred",
      p_contact_ids: [aContactId],
    });
    expect(rpcErr).toBeNull();

    const { data: rows, error } = await userB.client
      .from("interactions")
      .select("id");
    expect(error).toBeNull();
    expect(rows).toEqual([]);

    const { data: links, error: linksErr } = await userB.client
      .from("interaction_contacts")
      .select("interaction_id");
    expect(linksErr).toBeNull();
    expect(links).toEqual([]);
  });
});
