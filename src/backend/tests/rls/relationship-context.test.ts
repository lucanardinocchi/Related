import {
  adminClient,
  setupTestUsers,
  teardownTestUsers,
  TestUser,
} from "../helpers/test-clients";

/**
 * ADR-0009 amendment 2026-05-21 — relationship_context RLS. Per-Relationship
 * narrative singleton written by the Extraction Pass; one row per
 * Relationship, replaceable wholly each run. Confirms owner-only visibility
 * and the singleton constraint.
 */
describe("RelationshipContext RLS + singleton", () => {
  let userA: TestUser;
  let userB: TestUser;
  let aContactId: string;
  let aRelationshipId: string;

  beforeEach(async () => {
    [userA, userB] = await setupTestUsers(2);

    const { data: contact, error: cErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Sam" })
      .select("id")
      .single();
    if (cErr || !contact) throw new Error(cErr?.message);
    aContactId = contact.id;

    const { data: rel, error: rErr } = await adminClient
      .from("relationships")
      .select("id")
      .eq("target_contact_id", aContactId)
      .single();
    if (rErr || !rel) throw new Error(rErr?.message);
    aRelationshipId = rel.id;
  });

  afterEach(async () => {
    const ids = [userA.id, userB.id];
    await adminClient.from("relationship_context").delete().in("owner_id", ids);
    await adminClient.from("relationships").delete().in("owner_id", ids);
    await adminClient.from("contacts").delete().in("owner_id", ids);
    await teardownTestUsers([userA, userB]);
  });

  test("User B cannot read User A's Relationship Context", async () => {
    const { error: insertErr } = await adminClient
      .from("relationship_context")
      .insert({
        owner_id: userA.id,
        relationship_id: aRelationshipId,
        content: "Sam has been quiet this week.",
      });
    expect(insertErr).toBeNull();

    const { data, error } = await userB.client
      .from("relationship_context")
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("singleton constraint: a second insert for the same Relationship fails", async () => {
    const first = await adminClient.from("relationship_context").insert({
      owner_id: userA.id,
      relationship_id: aRelationshipId,
      content: "First narrative.",
    });
    expect(first.error).toBeNull();

    const second = await adminClient.from("relationship_context").insert({
      owner_id: userA.id,
      relationship_id: aRelationshipId,
      content: "Second narrative.",
    });
    expect(second.error).not.toBeNull();
  });

  test("upsert replaces the singleton wholesale (Extraction Pass merge contract)", async () => {
    const { error: aErr } = await adminClient.from("relationship_context").insert({
      owner_id: userA.id,
      relationship_id: aRelationshipId,
      content: "Initial narrative.",
    });
    expect(aErr).toBeNull();

    const { error: bErr } = await adminClient
      .from("relationship_context")
      .upsert(
        {
          owner_id: userA.id,
          relationship_id: aRelationshipId,
          content: "Replacement narrative.",
        },
        { onConflict: "relationship_id" },
      );
    expect(bErr).toBeNull();

    const { data } = await userA.client
      .from("relationship_context")
      .select("content")
      .eq("relationship_id", aRelationshipId);
    expect(data?.map((r) => r.content)).toEqual(["Replacement narrative."]);
  });

  test("User A can update and delete their own Relationship Context", async () => {
    const { data: inserted, error: insertErr } = await adminClient
      .from("relationship_context")
      .insert({
        owner_id: userA.id,
        relationship_id: aRelationshipId,
        content: "Initial.",
      })
      .select("id")
      .single();
    expect(insertErr).toBeNull();

    const { error: updateErr } = await userA.client
      .from("relationship_context")
      .update({ content: "User-edited." })
      .eq("id", inserted!.id);
    expect(updateErr).toBeNull();

    const { error: deleteErr } = await userA.client
      .from("relationship_context")
      .delete()
      .eq("id", inserted!.id);
    expect(deleteErr).toBeNull();
  });

  test("deleting the Relationship cascades the Relationship Context", async () => {
    const { error: insertErr } = await adminClient.from("relationship_context").insert({
      owner_id: userA.id,
      relationship_id: aRelationshipId,
      content: "Doomed narrative.",
    });
    expect(insertErr).toBeNull();

    const { error: delErr } = await adminClient
      .from("relationships")
      .delete()
      .eq("id", aRelationshipId);
    expect(delErr).toBeNull();

    const { data } = await adminClient
      .from("relationship_context")
      .select("id")
      .eq("relationship_id", aRelationshipId);
    expect(data).toEqual([]);
  });
});
