import {
  adminClient,
  setupTestUsers,
  teardownTestUsers,
  TestUser,
} from "../helpers/test-clients";

describe("Contact RLS", () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeEach(async () => {
    [userA, userB] = await setupTestUsers(2);
  });

  afterEach(async () => {
    await adminClient.from("contacts").delete().eq("owner_id", userA.id);
    await adminClient.from("contacts").delete().eq("owner_id", userB.id);
    await teardownTestUsers([userA, userB]);
  });

  test("User A cannot create a Contact owned by User B", async () => {
    const { error } = await userA.client
      .from("contacts")
      .insert({ owner_id: userB.id, name: "Theft" });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501"); // RLS violation
  });

  test("User B cannot read User A's Contact", async () => {
    // Service-role insert — bypasses RLS, simulates a row owned by User A.
    const { error: insertErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Sam" });
    expect(insertErr).toBeNull();

    // User B's anon-scoped client must not see it.
    const { data, error } = await userB.client
      .from("contacts")
      .select("id, name");

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("User A can insert + read back their own Contact via their own client", async () => {
    const { error: insertErr } = await userA.client
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Priya" });
    expect(insertErr).toBeNull();

    const { data, error } = await userA.client
      .from("contacts")
      .select("name");
    expect(error).toBeNull();
    expect(data).toEqual([{ name: "Priya" }]);
  });

  test("Inserting a Contact auto-creates its Relationship", async () => {
    const { data: contact, error: contactErr } = await userA.client
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Maya" })
      .select("id")
      .single();
    expect(contactErr).toBeNull();

    const { data: rels, error: relsErr } = await userA.client
      .from("relationships")
      .select("owner_id, target_type, target_contact_id");
    expect(relsErr).toBeNull();
    expect(rels).toEqual([
      {
        owner_id: userA.id,
        target_type: "contact",
        target_contact_id: contact!.id,
      },
    ]);
  });

  test("Contact stores optional phone and email channels", async () => {
    const { error: insertErr } = await userA.client.from("contacts").insert({
      owner_id: userA.id,
      name: "Jules",
      phone: "+61 400 000 000",
      email: "jules@example.com",
    });
    expect(insertErr).toBeNull();

    const { data, error } = await userA.client
      .from("contacts")
      .select("name, phone, email");
    expect(error).toBeNull();
    expect(data).toEqual([
      {
        name: "Jules",
        phone: "+61 400 000 000",
        email: "jules@example.com",
      },
    ]);
  });
});
