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

  test("Relationship rejects unsupported target_type (slice 2 = contact only)", async () => {
    const { error } = await adminClient.from("relationships").insert({
      owner_id: userA.id,
      target_type: "group",
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
});
