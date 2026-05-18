import {
  adminClient,
  setupTestUsers,
  teardownTestUsers,
  TestUser,
} from "../helpers/test-clients";

/**
 * Slice 3 — Open Threads. Each test owns the rows it creates (no shared
 * fixtures beyond the two users) so failures are localised.
 */
describe("Open Threads — RLS + multi-Relationship semantics", () => {
  let userA: TestUser;
  let userB: TestUser;
  let aRelationshipId: string;

  beforeEach(async () => {
    [userA, userB] = await setupTestUsers(2);

    const { data: aContact, error: aErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Sam" })
      .select("id")
      .single();
    if (aErr || !aContact) throw new Error(aErr?.message ?? "no contact A");

    const { data: aRel, error: aRelErr } = await adminClient
      .from("relationships")
      .select("id")
      .eq("owner_id", userA.id)
      .single();
    if (aRelErr || !aRel) throw new Error(aRelErr?.message ?? "no rel A");
    aRelationshipId = aRel.id;

    // User B also gets a Contact (and via trigger, a Relationship) so the
    // cross-user RLS tests have a baseline of B-owned rows to confirm
    // isolation against.
    const { error: bErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userB.id, name: "Priya" });
    if (bErr) throw new Error(bErr.message);
  });

  afterEach(async () => {
    const ids = [userA.id, userB.id];
    await adminClient.from("open_thread_relationships").delete().in("owner_id", ids);
    await adminClient.from("open_threads").delete().in("owner_id", ids);
    await adminClient.from("relationships").delete().in("owner_id", ids);
    await adminClient.from("contacts").delete().in("owner_id", ids);
    await teardownTestUsers([userA, userB]);
  });

  test("User A can create an Open Thread and read it back, with linked Relationships", async () => {
    const { data: created, error: rpcErr } = await userA.client.rpc(
      "create_open_thread",
      {
        p_description: "owe Sam a coffee",
        p_direction: "me_owes_them",
        p_relationship_ids: [aRelationshipId],
      },
    );
    expect(rpcErr).toBeNull();
    expect(created).toBeTruthy();

    const { data: rows, error: readErr } = await userA.client
      .from("open_threads")
      .select("id, description, direction, closed_at");
    expect(readErr).toBeNull();
    expect(rows).toEqual([
      expect.objectContaining({
        description: "owe Sam a coffee",
        direction: "me_owes_them",
        closed_at: null,
      }),
    ]);

    const { data: links, error: linksErr } = await userA.client
      .from("open_thread_relationships")
      .select("relationship_id");
    expect(linksErr).toBeNull();
    expect(links).toEqual([{ relationship_id: aRelationshipId }]);
  });

  test("User B cannot see User A's Open Threads", async () => {
    const { error: rpcErr } = await userA.client.rpc("create_open_thread", {
      p_description: "private to A",
      p_direction: "they_owe_me",
      p_relationship_ids: [aRelationshipId],
    });
    expect(rpcErr).toBeNull();

    const { data, error } = await userB.client.from("open_threads").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: links, error: linksErr } = await userB.client
      .from("open_thread_relationships")
      .select("open_thread_id");
    expect(linksErr).toBeNull();
    expect(links).toEqual([]);
  });

  test("User B cannot link a thread to User A's Relationship", async () => {
    const { error } = await userB.client.rpc("create_open_thread", {
      p_description: "cross-user attack",
      p_direction: "me_owes_them",
      p_relationship_ids: [aRelationshipId],
    });
    expect(error).not.toBeNull();
  });

  test("direction CHECK rejects values other than me_owes_them / they_owe_me", async () => {
    const { error } = await adminClient.from("open_threads").insert({
      owner_id: userA.id,
      description: "bogus",
      direction: "mutual",
    });
    expect(error).not.toBeNull();
  });

  test("closing a multi-Relationship thread closes it across every linked Relationship", async () => {
    const { data: otherContact, error: otherErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Jules" })
      .select("id")
      .single();
    if (otherErr || !otherContact) throw new Error(otherErr?.message);

    const { data: otherRel, error: otherRelErr } = await adminClient
      .from("relationships")
      .select("id")
      .eq("owner_id", userA.id)
      .eq("target_contact_id", otherContact.id)
      .single();
    if (otherRelErr || !otherRel) throw new Error(otherRelErr?.message);

    const { data: threadId, error: rpcErr } = await userA.client.rpc(
      "create_open_thread",
      {
        p_description: "introduce Sam to Jules",
        p_direction: "me_owes_them",
        p_relationship_ids: [aRelationshipId, otherRel.id],
      },
    );
    expect(rpcErr).toBeNull();
    expect(typeof threadId).toBe("string");

    const { error: updateErr } = await userA.client
      .from("open_threads")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", threadId as string);
    expect(updateErr).toBeNull();

    const { data: link1 } = await userA.client
      .from("open_thread_relationships")
      .select("open_thread_id, open_threads(closed_at)")
      .eq("relationship_id", aRelationshipId)
      .single();
    const { data: link2 } = await userA.client
      .from("open_thread_relationships")
      .select("open_thread_id, open_threads(closed_at)")
      .eq("relationship_id", otherRel.id)
      .single();

    expect((link1 as any)?.open_threads?.closed_at).not.toBeNull();
    expect((link2 as any)?.open_threads?.closed_at).not.toBeNull();
    expect((link1 as any)?.open_thread_id).toEqual(
      (link2 as any)?.open_thread_id,
    );
  });

  test("create_open_thread requires at least one Relationship", async () => {
    const { error } = await userA.client.rpc("create_open_thread", {
      p_description: "no links",
      p_direction: "me_owes_them",
      p_relationship_ids: [],
    });
    expect(error).not.toBeNull();
  });

  test("User B cannot close User A's Open Thread", async () => {
    const { data: threadId, error: rpcErr } = await userA.client.rpc(
      "create_open_thread",
      {
        p_description: "still A's",
        p_direction: "they_owe_me",
        p_relationship_ids: [aRelationshipId],
      },
    );
    expect(rpcErr).toBeNull();

    const { data: updated, error: updateErr } = await userB.client
      .from("open_threads")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", threadId as string)
      .select("id");
    expect(updateErr).toBeNull();
    expect(updated).toEqual([]); // RLS hides the row → nothing updated

    // Confirm A's view still shows it open.
    const { data: aView } = await userA.client
      .from("open_threads")
      .select("closed_at")
      .eq("id", threadId as string)
      .single();
    expect((aView as any)?.closed_at).toBeNull();
  });
});
