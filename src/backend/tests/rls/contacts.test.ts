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

  test("Contact stores optional profile fields (birthday, area, occupation, education)", async () => {
    // ADR-0008 / 20260520000001_contact_profile_fields.sql — the web
    // Relationship detail page's Key Details section reads/writes these.
    const { error: insertErr } = await userA.client.from("contacts").insert({
      owner_id: userA.id,
      name: "Priya",
      birthday: "1990-04-12",
      area: "Surry Hills",
      occupation: "product designer",
      education: "UNSW, BSc",
    });
    expect(insertErr).toBeNull();

    const { data, error } = await userA.client
      .from("contacts")
      .select("name, birthday, area, occupation, education");
    expect(error).toBeNull();
    expect(data).toEqual([
      {
        name: "Priya",
        birthday: "1990-04-12",
        area: "Surry Hills",
        occupation: "product designer",
        education: "UNSW, BSc",
      },
    ]);
  });

  test("User A can update their own Contact (profile fields)", async () => {
    const { data: created, error: insertErr } = await userA.client
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Maya" })
      .select("id")
      .single();
    expect(insertErr).toBeNull();

    const { error: updateErr } = await userA.client
      .from("contacts")
      .update({
        occupation: "lawyer",
        area: "Newtown",
        birthday: "1988-09-03",
      })
      .eq("id", created!.id);
    expect(updateErr).toBeNull();

    const { data, error } = await userA.client
      .from("contacts")
      .select("occupation, area, birthday")
      .eq("id", created!.id)
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({
      occupation: "lawyer",
      area: "Newtown",
      birthday: "1988-09-03",
    });
  });

  test("User B cannot update User A's Contact", async () => {
    const { data: aContact, error: insertErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Sam", occupation: "engineer" })
      .select("id")
      .single();
    expect(insertErr).toBeNull();

    const { data: updated } = await userB.client
      .from("contacts")
      .update({ occupation: "hacked" })
      .eq("id", aContact!.id)
      .select("id");
    // RLS hides the row from User B → update returns no rows, not an error.
    expect(updated).toEqual([]);

    const { data: aView } = await userA.client
      .from("contacts")
      .select("occupation")
      .eq("id", aContact!.id)
      .single();
    expect((aView as any)?.occupation).toBe("engineer");
  });

  test("User A can delete their own Contact (Relationship cascades)", async () => {
    const { data: created } = await userA.client
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Temp" })
      .select("id")
      .single();
    if (!created) throw new Error("no contact");

    const { error: deleteErr } = await userA.client
      .from("contacts")
      .delete()
      .eq("id", created.id);
    expect(deleteErr).toBeNull();

    const { data: remaining } = await userA.client
      .from("contacts")
      .select("id")
      .eq("id", created.id);
    expect(remaining).toEqual([]);
  });

  test("User B cannot delete User A's Contact", async () => {
    const { data: aContact } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Untouchable" })
      .select("id")
      .single();
    if (!aContact) throw new Error("no contact");

    await userB.client.from("contacts").delete().eq("id", aContact.id);

    const { data } = await adminClient
      .from("contacts")
      .select("id")
      .eq("id", aContact.id);
    expect(data).toEqual([{ id: aContact.id }]);
  });
});
