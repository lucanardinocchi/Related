import {
  adminClient,
  setupTestUsers,
  teardownTestUsers,
  TestUser,
} from "../helpers/test-clients";

/**
 * Slice 7 — Candidate Sets + Candidate Actions. RLS isolation is the tracer
 * for the agent loop's persistence layer.
 */
describe("CandidateSet + CandidateAction RLS", () => {
  let userA: TestUser;
  let userB: TestUser;
  let aRelationshipId: string;

  beforeEach(async () => {
    [userA, userB] = await setupTestUsers(2);

    const { data: contact, error: cErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Sam" })
      .select("id")
      .single();
    if (cErr || !contact) throw new Error(cErr?.message);

    const { data: rel, error: rErr } = await adminClient
      .from("relationships")
      .select("id")
      .eq("owner_id", userA.id)
      .single();
    if (rErr || !rel) throw new Error(rErr?.message);
    aRelationshipId = rel.id;
  });

  afterEach(async () => {
    const ids = [userA.id, userB.id];
    await adminClient.from("candidate_actions").delete().in("owner_id", ids);
    await adminClient.from("candidate_sets").delete().in("owner_id", ids);
    await adminClient.from("relationships").delete().in("owner_id", ids);
    await adminClient.from("contacts").delete().in("owner_id", ids);
    await teardownTestUsers([userA, userB]);
  });

  test("User B cannot see User A's Candidate Sets or Actions", async () => {
    const { data: setRow, error: sErr } = await adminClient
      .from("candidate_sets")
      .insert({
        owner_id: userA.id,
        relationship_id: aRelationshipId,
        mode: "baseline",
      })
      .select("id")
      .single();
    if (sErr || !setRow) throw new Error(sErr?.message);

    const { error: aErr } = await adminClient.from("candidate_actions").insert({
      owner_id: userA.id,
      candidate_set_id: setRow.id,
      type: "DoNothing",
      why: "no changes warrant a Candidate Action",
    });
    if (aErr) throw new Error(aErr.message);

    const { data: bSets, error: bsErr } = await userB.client
      .from("candidate_sets")
      .select("id");
    expect(bsErr).toBeNull();
    expect(bSets).toEqual([]);

    const { data: bActs, error: baErr } = await userB.client
      .from("candidate_actions")
      .select("id");
    expect(baErr).toBeNull();
    expect(bActs).toEqual([]);
  });

  test("CandidateAction.decision_state CHECK rejects unknown values", async () => {
    const { data: setRow } = await adminClient
      .from("candidate_sets")
      .insert({
        owner_id: userA.id,
        relationship_id: aRelationshipId,
        mode: "baseline",
      })
      .select("id")
      .single();
    if (!setRow) throw new Error("no set");

    const { error } = await adminClient.from("candidate_actions").insert({
      owner_id: userA.id,
      candidate_set_id: setRow.id,
      type: "DoNothing",
      decision_state: "snoozed",
    });
    expect(error).not.toBeNull();
  });

  test("CandidateSet.mode CHECK rejects unknown values", async () => {
    const { error } = await adminClient.from("candidate_sets").insert({
      owner_id: userA.id,
      relationship_id: aRelationshipId,
      mode: "speculative",
    });
    expect(error).not.toBeNull();
  });
});
