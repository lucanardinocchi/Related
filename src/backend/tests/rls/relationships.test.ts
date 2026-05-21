import {
  adminClient,
  setupTestUsers,
  teardownTestUsers,
  TestUser,
} from "../helpers/test-clients";

describe("Relationship RLS + polymorphic target", () => {
  let userA: TestUser;
  let userB: TestUser;
  let userAContactId: string;

  beforeEach(async () => {
    [userA, userB] = await setupTestUsers(2);

    const { data, error } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Sam" })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "no contact");
    userAContactId = data.id;
  });

  afterEach(async () => {
    await adminClient
      .from("relationships")
      .delete()
      .in("owner_id", [userA.id, userB.id]);
    await adminClient
      .from("contacts")
      .delete()
      .in("owner_id", [userA.id, userB.id]);
    await teardownTestUsers([userA, userB]);
  });

  test("User B cannot read User A's Relationship", async () => {
    // beforeEach already created a Contact for User A — which the trigger
    // auto-paired with a Relationship. User B's anon-scoped client must not
    // see it.
    const { data, error } = await userB.client
      .from("relationships")
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("User B cannot fetch User A's Relationship by id (Single Relationship view gate)", async () => {
    // The Single Relationship view loads via getRelationship(id) — the same
    // `.from("relationships").select(...).eq("id", id).single()` shape that
    // ships in RelationshipsClient. Under RLS the row is invisible to User B,
    // so `.single()` resolves with no row and an error rather than leaking the
    // sibling User's bond.
    const { data: aRel } = await adminClient
      .from("relationships")
      .select("id")
      .eq("owner_id", userA.id)
      .single();
    if (!aRel) throw new Error("no relationship for user A");

    const { data, error } = await userB.client
      .from("relationships")
      .select("id")
      .eq("id", aRel.id)
      .maybeSingle();
    expect(data).toBeNull();
    expect(error).toBeNull();
  });

  test("Relationship rejects unsupported target_type", async () => {
    const { error } = await adminClient.from("relationships").insert({
      owner_id: userA.id,
      target_type: "household",
      target_contact_id: userAContactId,
    });
    expect(error).not.toBeNull();
  });

  test("Relationship rejects target_type='contact' with no target_contact_id", async () => {
    const { error } = await adminClient.from("relationships").insert({
      owner_id: userA.id,
      target_type: "contact",
      target_contact_id: null,
    });
    expect(error).not.toBeNull();
  });

  test("Relationship rejects pointing at both Contact and Group", async () => {
    const { error } = await adminClient.from("relationships").insert({
      owner_id: userA.id,
      target_type: "contact",
      target_contact_id: userAContactId,
      // No group exists yet, but the CHECK should fire on the column being set.
      target_group_id: "00000000-0000-0000-0000-000000000001",
    });
    expect(error).not.toBeNull();
  });

  test("User A can update their own Relationship's role and cadence", async () => {
    // 20260520000003_crud_rls_policies.sql added the UPDATE policy that
    // ADR-0008's web Relationship detail page needs to land role/cadence
    // edits (the columns themselves shipped in slice 8 but were unreachable
    // from authenticated clients before this).
    const { data: aRel } = await adminClient
      .from("relationships")
      .select("id")
      .eq("owner_id", userA.id)
      .single();
    if (!aRel) throw new Error("no relationship");

    const { error: updateErr } = await userA.client
      .from("relationships")
      .update({ role: "close friend", cadence: "weekly" })
      .eq("id", aRel.id);
    expect(updateErr).toBeNull();

    const { data } = await userA.client
      .from("relationships")
      .select("role, cadence")
      .eq("id", aRel.id)
      .single();
    expect(data).toEqual({ role: "close friend", cadence: "weekly" });
  });

  test("User B cannot update User A's Relationship", async () => {
    const { data: aRel } = await adminClient
      .from("relationships")
      .select("id")
      .eq("owner_id", userA.id)
      .single();
    if (!aRel) throw new Error("no relationship");

    const { data: updated } = await userB.client
      .from("relationships")
      .update({ role: "hijacked" })
      .eq("id", aRel.id)
      .select("id");
    expect(updated).toEqual([]);

    const { data: aView } = await userA.client
      .from("relationships")
      .select("role")
      .eq("id", aRel.id)
      .single();
    expect((aView as any)?.role).toBeNull();
  });

  test("User A can delete their own Relationship", async () => {
    // Insert a fresh contact + relationship (the beforeEach one belongs to a
    // contact we still want around for other tests; delete this one in
    // isolation).
    const { data: tempContact } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Temp" })
      .select("id")
      .single();
    if (!tempContact) throw new Error("no temp contact");

    const { data: tempRel } = await adminClient
      .from("relationships")
      .select("id")
      .eq("target_contact_id", tempContact.id)
      .single();
    if (!tempRel) throw new Error("no temp relationship");

    const { error: deleteErr } = await userA.client
      .from("relationships")
      .delete()
      .eq("id", tempRel.id);
    expect(deleteErr).toBeNull();

    const { data: remaining } = await userA.client
      .from("relationships")
      .select("id")
      .eq("id", tempRel.id);
    expect(remaining).toEqual([]);
  });
});
