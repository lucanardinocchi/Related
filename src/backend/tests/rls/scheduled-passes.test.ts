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
 *     12 hours and enqueues a row per active Relationship.
 *   - Triggered Pass: on Interaction insert / Open Thread change /
 *     Candidate decision update / Goals & Values edit / Inferred Signal
 *     shift / approaching planned Interaction, a trigger (or cron scan)
 *     enqueues a row scoped to the affected Relationship(s). Debounced
 *     ~5 minutes to coalesce rapid bursts.
 *
 * Both produce rows in `scheduled_passes` — drained server-side by the
 * `ambient-dispatch` Edge Function (pg_cron every minute).
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
    await adminClient.from("inferred_signal_calendar").delete().in("owner_id", ids);
    await adminClient.from("inferred_signal_sleep").delete().in("owner_id", ids);
    await adminClient.from("goals_and_values").delete().in("owner_id", ids);
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

  test("schedule_triggered_pass() enqueues a Triggered Pass for an owned Relationship", async () => {
    const { error: rpcErr } = await userA.client.rpc("schedule_triggered_pass", {
      p_relationship_id: aRelationshipId,
      p_reason: "candidate_decision",
    });
    expect(rpcErr).toBeNull();

    const { data: scheduled } = await adminClient
      .from("scheduled_passes")
      .select("relationship_id, mode, reason, dispatched_at")
      .eq("owner_id", userA.id);
    expect(scheduled).toEqual([
      {
        relationship_id: aRelationshipId,
        mode: "triggered",
        reason: "candidate_decision",
        dispatched_at: null,
      },
    ]);
  });

  test("schedule_triggered_pass() rejects a Relationship the caller does not own", async () => {
    const { error: rpcErr } = await userB.client.rpc("schedule_triggered_pass", {
      p_relationship_id: aRelationshipId,
      p_reason: "candidate_decision",
    });
    expect(rpcErr).not.toBeNull();
  });

  test("inserting a Goal or Value enqueues a Triggered Pass for every owned Relationship", async () => {
    await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Jules" });

    await userA.client
      .from("goals_and_values")
      .insert({ owner_id: userA.id, content: "Be more present with family" });

    const { data: scheduled } = await adminClient
      .from("scheduled_passes")
      .select("relationship_id, mode, reason")
      .eq("owner_id", userA.id);
    expect(scheduled).toHaveLength(2);
    for (const row of scheduled ?? []) {
      expect(row.mode).toBe("triggered");
      expect(row.reason).toBe("goals_and_values_changed");
    }
  });

  test("deleting a Goal or Value enqueues a Triggered Pass for every owned Relationship", async () => {
    const { data: goal } = await userA.client
      .from("goals_and_values")
      .insert({ owner_id: userA.id, content: "Move slow" })
      .select("id")
      .single();
    if (!goal) throw new Error("no goal");

    await adminClient.from("scheduled_passes").delete().eq("owner_id", userA.id);

    await userA.client.from("goals_and_values").delete().eq("id", goal.id);

    const { data: scheduled } = await adminClient
      .from("scheduled_passes")
      .select("relationship_id, reason")
      .eq("owner_id", userA.id);
    expect(scheduled).toEqual([
      { relationship_id: aRelationshipId, reason: "goals_and_values_changed" },
    ]);
  });

  test("inserting a calendar Inferred Signal enqueues a Triggered Pass for every owned Relationship", async () => {
    await adminClient.from("inferred_signal_calendar").insert({
      owner_id: userA.id,
      event_id: "evt-approaching",
      title: "Team offsite",
      start: "2026-05-25T09:00:00Z",
      end: "2026-05-25T17:00:00Z",
      is_all_day: false,
    });

    const { data: scheduled } = await adminClient
      .from("scheduled_passes")
      .select("relationship_id, mode, reason")
      .eq("owner_id", userA.id);
    expect(scheduled).toEqual([
      {
        relationship_id: aRelationshipId,
        mode: "triggered",
        reason: "inferred_signal_calendar_changed",
      },
    ]);
  });

  test("inserting a sleep Inferred Signal enqueues a Triggered Pass for every owned Relationship", async () => {
    await adminClient.from("inferred_signal_sleep").insert({
      owner_id: userA.id,
      record_id: "sleep-1",
      started_at: "2026-05-20T22:00:00Z",
      ended_at: "2026-05-21T06:00:00Z",
      duration_minutes: 480,
    });

    const { data: scheduled } = await adminClient
      .from("scheduled_passes")
      .select("relationship_id, mode, reason")
      .eq("owner_id", userA.id);
    expect(scheduled).toEqual([
      {
        relationship_id: aRelationshipId,
        mode: "triggered",
        reason: "inferred_signal_sleep_changed",
      },
    ]);
  });

  test("schedule_approaching_planned_interaction_passes() enqueues a Triggered Pass for linked Relationships", async () => {
    const approachingTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await userA.client.rpc("create_interaction", {
      p_time: approachingTime,
      p_kind: "coffee",
      p_notes: null,
      p_status: "planned",
      p_contact_ids: [aContactId],
    });

    // Reset the queue so we only observe the approaching-window scan.
    await adminClient.from("scheduled_passes").delete().eq("owner_id", userA.id);

    await adminClient.rpc("schedule_approaching_planned_interaction_passes");

    const { data: scheduled } = await adminClient
      .from("scheduled_passes")
      .select("relationship_id, mode, reason")
      .eq("owner_id", userA.id);
    expect(scheduled).toEqual([
      {
        relationship_id: aRelationshipId,
        mode: "triggered",
        reason: "planned_interaction_approaching",
      },
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
