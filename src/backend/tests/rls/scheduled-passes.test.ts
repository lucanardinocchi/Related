import {
  adminClient,
  setupTestUsers,
  teardownTestUsers,
  TestUser,
} from "../helpers/test-clients";

/**
 * Slice 7 — the Pass scheduler. The Ambient Intelligence spine has three
 * tiers (ADR-0001); this test exercises the two automated ones:
 *
 *   - Baseline Pass: pg_cron job calls schedule_baseline_passes() every
 *     6 hours and enqueues a row per active Relationship.
 *   - Triggered Pass: on Interaction insert / Open Thread change /
 *     Candidate decision update, a trigger enqueues a row scoped to the
 *     affected Relationship(s). Debounced ~5 minutes to coalesce rapid
 *     bursts.
 *
 * Both produce rows in `scheduled_passes` — the dispatch queue an Edge
 * Function will consume in a later slice. Observing the queue is how we
 * pin scheduler behaviour without standing up the dispatcher itself.
 */
describe("Pass scheduler", () => {
  let userA: TestUser;
  let userB: TestUser;
  let aContactId: string;
  let aRelationshipId: string;

  beforeEach(async () => {
    [userA, userB] = await setupTestUsers(2);
    const { data: c } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Sam" })
      .select("id")
      .single();
    if (!c) throw new Error("no contact");
    aContactId = c.id;
    const { data: r } = await adminClient
      .from("relationships")
      .select("id")
      .eq("owner_id", userA.id)
      .single();
    if (!r) throw new Error("no relationship");
    aRelationshipId = r.id;
  });

  afterEach(async () => {
    const ids = [userA.id, userB.id];
    await adminClient.from("scheduled_passes").delete().in("owner_id", ids);
    await adminClient.from("candidate_actions").delete().in("owner_id", ids);
    await adminClient.from("candidate_sets").delete().in("owner_id", ids);
    await adminClient.from("interaction_contacts").delete().in("owner_id", ids);
    await adminClient.from("interactions").delete().in("owner_id", ids);
    await adminClient.from("open_thread_relationships").delete().in("owner_id", ids);
    await adminClient.from("open_threads").delete().in("owner_id", ids);
    await adminClient.from("contact_groups").delete().in("owner_id", ids);
    await adminClient.from("relationships").delete().in("owner_id", ids);
    await adminClient.from("groups").delete().in("owner_id", ids);
    await adminClient.from("contacts").delete().in("owner_id", ids);
    await teardownTestUsers([userA, userB]);
  });

  test("inserting an Interaction enqueues a Triggered Pass for every linked Relationship", async () => {
    const { error: rpcErr } = await userA.client.rpc("create_interaction", {
      p_time: "2026-05-10T09:00:00Z",
      p_kind: "coffee",
      p_notes: null,
      p_status: "occurred",
      p_contact_ids: [aContactId],
    });
    expect(rpcErr).toBeNull();

    const { data: scheduled, error: readErr } = await adminClient
      .from("scheduled_passes")
      .select("relationship_id, mode, reason, dispatched_at")
      .eq("owner_id", userA.id);
    expect(readErr).toBeNull();
    expect(scheduled).toEqual([
      {
        relationship_id: aRelationshipId,
        mode: "triggered",
        reason: "interaction_inserted",
        dispatched_at: null,
      },
    ]);
  });

  test("a second Interaction within the debounce window does not enqueue a duplicate Pass", async () => {
    await userA.client.rpc("create_interaction", {
      p_time: "2026-05-10T09:00:00Z",
      p_kind: "coffee",
      p_notes: null,
      p_status: "occurred",
      p_contact_ids: [aContactId],
    });
    await userA.client.rpc("create_interaction", {
      p_time: "2026-05-10T10:00:00Z",
      p_kind: "call",
      p_notes: null,
      p_status: "occurred",
      p_contact_ids: [aContactId],
    });

    const { data: scheduled } = await adminClient
      .from("scheduled_passes")
      .select("id, reason")
      .eq("owner_id", userA.id)
      .is("dispatched_at", null);
    expect((scheduled ?? []).length).toBe(1);
  });

  test("closing an Open Thread enqueues a Triggered Pass on each linked Relationship", async () => {
    const { data: threadId } = await userA.client.rpc("create_open_thread", {
      p_description: "owe Sam coffee",
      p_direction: "me_owes_them",
      p_relationship_ids: [aRelationshipId],
    });

    // Reset the queue so we only observe the post-close enqueue.
    await adminClient.from("scheduled_passes").delete().eq("owner_id", userA.id);

    await adminClient
      .from("open_threads")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", threadId as string);

    const { data: scheduled } = await adminClient
      .from("scheduled_passes")
      .select("relationship_id, reason")
      .eq("owner_id", userA.id);
    expect(scheduled).toEqual([
      { relationship_id: aRelationshipId, reason: "open_thread_changed" },
    ]);
  });

  test("schedule_baseline_passes() enqueues a Baseline Pass for every Relationship the User owns", async () => {
    // Add a second Relationship (via Contact insert) so the function clearly
    // enqueues one per Relationship rather than one per User.
    await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Jules" });

    await adminClient.rpc("schedule_baseline_passes");

    const { data: scheduled } = await adminClient
      .from("scheduled_passes")
      .select("relationship_id, mode")
      .eq("owner_id", userA.id);
    expect(scheduled).toHaveLength(2);
    for (const s of scheduled ?? []) {
      expect(s.mode).toBe("baseline");
    }
  });
});
