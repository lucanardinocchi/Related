import {
  adminClient,
  setupTestUsers,
  teardownTestUsers,
  TestUser,
} from "../helpers/test-clients";

/**
 * Slice 3 — closed_threads_per_day RPC. Returns one row per UTC day in
 * [from, to], zero-filled. Scoped to the calling User by RLS.
 */
describe("closed_threads_per_day RPC", () => {
  let userA: TestUser;
  let userB: TestUser;
  let aRelationshipId: string;

  beforeEach(async () => {
    [userA, userB] = await setupTestUsers(2);

    const { error: cErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Sam" });
    if (cErr) throw new Error(cErr.message);

    const { data: aRel, error: rErr } = await adminClient
      .from("relationships")
      .select("id")
      .eq("owner_id", userA.id)
      .single();
    if (rErr || !aRel) throw new Error(rErr?.message ?? "no rel A");
    aRelationshipId = aRel.id;

    // User B gets a Contact too so we have B-owned rows to confirm isolation
    // against (B's threads must not leak into A's per-day counts).
    const { error: bcErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userB.id, name: "Priya" });
    if (bcErr) throw new Error(bcErr.message);
  });

  afterEach(async () => {
    const ids = [userA.id, userB.id];
    await adminClient.from("open_thread_relationships").delete().in("owner_id", ids);
    await adminClient.from("open_threads").delete().in("owner_id", ids);
    await adminClient.from("relationships").delete().in("owner_id", ids);
    await adminClient.from("contacts").delete().in("owner_id", ids);
    await teardownTestUsers([userA, userB]);
  });

  async function seedClosedThread(
    user: TestUser,
    relationshipId: string,
    closedAt: string,
  ): Promise<void> {
    const { data: id, error: rpcErr } = await user.client.rpc(
      "create_open_thread",
      {
        p_description: "seed",
        p_direction: "me_owes_them",
        p_relationship_ids: [relationshipId],
      },
    );
    if (rpcErr) throw new Error(rpcErr.message);
    const { error: updateErr } = await user.client
      .from("open_threads")
      .update({ closed_at: closedAt })
      .eq("id", id as string);
    if (updateErr) throw new Error(updateErr.message);
  }

  test("returns zero-filled daily counts across the requested window", async () => {
    // Seed three closes on day 0, one on day 2, zero on day 1.
    await seedClosedThread(userA, aRelationshipId, "2026-05-01T10:00:00Z");
    await seedClosedThread(userA, aRelationshipId, "2026-05-01T15:00:00Z");
    await seedClosedThread(userA, aRelationshipId, "2026-05-01T23:30:00Z");
    await seedClosedThread(userA, aRelationshipId, "2026-05-03T08:00:00Z");

    const { data, error } = await userA.client.rpc(
      "closed_threads_per_day",
      {
        p_from: "2026-05-01",
        p_to: "2026-05-03",
      },
    );
    expect(error).toBeNull();
    expect(data).toEqual([
      { day: "2026-05-01", count: 3 },
      { day: "2026-05-02", count: 0 },
      { day: "2026-05-03", count: 1 },
    ]);
  });

  test("excludes still-open threads", async () => {
    const { data: id, error: rpcErr } = await userA.client.rpc(
      "create_open_thread",
      {
        p_description: "still open",
        p_direction: "me_owes_them",
        p_relationship_ids: [aRelationshipId],
      },
    );
    expect(rpcErr).toBeNull();
    expect(id).toBeTruthy();

    const { data, error } = await userA.client.rpc(
      "closed_threads_per_day",
      {
        p_from: "2026-05-01",
        p_to: "2026-05-02",
      },
    );
    expect(error).toBeNull();
    expect(data).toEqual([
      { day: "2026-05-01", count: 0 },
      { day: "2026-05-02", count: 0 },
    ]);
  });

  test("does not leak other Users' closed threads", async () => {
    const { data: bRel } = await adminClient
      .from("relationships")
      .select("id")
      .eq("owner_id", userB.id)
      .single();
    await seedClosedThread(userB, (bRel as any).id, "2026-05-01T10:00:00Z");

    const { data, error } = await userA.client.rpc(
      "closed_threads_per_day",
      {
        p_from: "2026-05-01",
        p_to: "2026-05-01",
      },
    );
    expect(error).toBeNull();
    expect(data).toEqual([{ day: "2026-05-01", count: 0 }]);
  });

  test("counts a thread on the UTC day its closed_at falls on", async () => {
    // 00:30 UTC on the 2nd is day 2, not day 1, even though Sydney local
    // would be the 2nd already — v1 buckets in UTC.
    await seedClosedThread(userA, aRelationshipId, "2026-05-02T00:30:00Z");

    const { data, error } = await userA.client.rpc(
      "closed_threads_per_day",
      {
        p_from: "2026-05-01",
        p_to: "2026-05-02",
      },
    );
    expect(error).toBeNull();
    expect(data).toEqual([
      { day: "2026-05-01", count: 0 },
      { day: "2026-05-02", count: 1 },
    ]);
  });
});
