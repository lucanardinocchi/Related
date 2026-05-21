import {
  adminClient,
  setupTestUsers,
  teardownTestUsers,
  TestUser,
} from "../helpers/test-clients";

/**
 * Slice 6 tracer — Groups RLS. Confirms a Group inserted on User A's behalf
 * is invisible to User B's anon-scoped client. This is the foundation every
 * later piece (Contact↔Group join, polymorphic Relationship target,
 * Group-mode Interactions) sits on; if cross-user reads leak here, nothing
 * downstream is safe.
 */
describe("Group RLS", () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeEach(async () => {
    [userA, userB] = await setupTestUsers(2);
  });

  afterEach(async () => {
    const ids = [userA.id, userB.id];
    await adminClient.from("contact_groups").delete().in("owner_id", ids);
    await adminClient.from("groups").delete().in("owner_id", ids);
    await adminClient.from("relationships").delete().in("owner_id", ids);
    await adminClient.from("contacts").delete().in("owner_id", ids);
    await teardownTestUsers([userA, userB]);
  });

  test("inserting a Group auto-creates a Group-targeted Relationship for the owner", async () => {
    const { data: aGroup, error: gErr } = await adminClient
      .from("groups")
      .insert({ owner_id: userA.id, name: "college friends" })
      .select("id")
      .single();
    if (gErr || !aGroup) throw new Error(gErr?.message);

    const { data: rels, error } = await adminClient
      .from("relationships")
      .select("target_type, target_contact_id, target_group_id")
      .eq("target_group_id", aGroup.id);
    expect(error).toBeNull();
    expect(rels).toEqual([
      {
        target_type: "group",
        target_contact_id: null,
        target_group_id: aGroup.id,
      },
    ]);
  });

  test("User B cannot read User A's Group", async () => {
    const { error: insertErr } = await adminClient
      .from("groups")
      .insert({ owner_id: userA.id, name: "college friends" });
    expect(insertErr).toBeNull();

    const { data, error } = await userB.client.from("groups").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("User B cannot insert a Group attributed to User A", async () => {
    const { error } = await userB.client
      .from("groups")
      .insert({ owner_id: userA.id, name: "stolen group" });
    expect(error).not.toBeNull();
  });

  test("User A can link their own Contact to their own Group", async () => {
    const { data: aGroup, error: aGroupErr } = await adminClient
      .from("groups")
      .insert({ owner_id: userA.id, name: "A's circle" })
      .select("id")
      .single();
    if (aGroupErr || !aGroup) throw new Error(aGroupErr?.message);

    const { data: aContact, error: aContactErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Sam" })
      .select("id")
      .single();
    if (aContactErr || !aContact) throw new Error(aContactErr?.message);

    const { error } = await userA.client.from("contact_groups").insert({
      contact_id: aContact.id,
      group_id: aGroup.id,
      owner_id: userA.id,
    });
    expect(error).toBeNull();

    const { data: links, error: readErr } = await userA.client
      .from("contact_groups")
      .select("contact_id, group_id");
    expect(readErr).toBeNull();
    expect(links).toEqual([
      { contact_id: aContact.id, group_id: aGroup.id },
    ]);
  });

  test("Relationship rejects target_type='group' with no target_group_id", async () => {
    const { error } = await adminClient.from("relationships").insert({
      owner_id: userA.id,
      target_type: "group",
      target_group_id: null,
    });
    expect(error).not.toBeNull();
  });

  test("Relationship rejects pointing at both a Contact and a Group", async () => {
    const { data: aContact, error: cErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Sam" })
      .select("id")
      .single();
    if (cErr || !aContact) throw new Error(cErr?.message);

    const { data: aGroup, error: gErr } = await adminClient
      .from("groups")
      .insert({ owner_id: userA.id, name: "college friends" })
      .select("id")
      .single();
    if (gErr || !aGroup) throw new Error(gErr?.message);

    const { error } = await adminClient.from("relationships").insert({
      owner_id: userA.id,
      target_type: "group",
      target_contact_id: aContact.id,
      target_group_id: aGroup.id,
    });
    expect(error).not.toBeNull();
  });

  test("add_group_member RPC links a Contact to a Group as the calling User", async () => {
    const { data: aGroup, error: gErr } = await adminClient
      .from("groups")
      .insert({ owner_id: userA.id, name: "circle" })
      .select("id")
      .single();
    if (gErr || !aGroup) throw new Error(gErr?.message);

    const { data: aContact, error: cErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Sam" })
      .select("id")
      .single();
    if (cErr || !aContact) throw new Error(cErr?.message);

    const { error: rpcErr } = await userA.client.rpc("add_group_member", {
      p_group_id: aGroup.id,
      p_contact_id: aContact.id,
    });
    expect(rpcErr).toBeNull();

    const { data: links } = await userA.client
      .from("contact_groups")
      .select("contact_id, group_id");
    expect(links).toEqual([
      { contact_id: aContact.id, group_id: aGroup.id },
    ]);
  });

  test("add_group_member RPC rejects a cross-user link", async () => {
    const { data: aGroup, error: gErr } = await adminClient
      .from("groups")
      .insert({ owner_id: userA.id, name: "A's circle" })
      .select("id")
      .single();
    if (gErr || !aGroup) throw new Error(gErr?.message);

    const { data: bContact, error: cErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userB.id, name: "Bob" })
      .select("id")
      .single();
    if (cErr || !bContact) throw new Error(cErr?.message);

    const { error } = await userB.client.rpc("add_group_member", {
      p_group_id: aGroup.id,
      p_contact_id: bContact.id,
    });
    expect(error).not.toBeNull();
  });

  test("remove_group_member RPC unlinks a Contact from a Group", async () => {
    const { data: aGroup, error: gErr } = await adminClient
      .from("groups")
      .insert({ owner_id: userA.id, name: "circle" })
      .select("id")
      .single();
    if (gErr || !aGroup) throw new Error(gErr?.message);

    const { data: aContact, error: cErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Sam" })
      .select("id")
      .single();
    if (cErr || !aContact) throw new Error(cErr?.message);

    await userA.client.rpc("add_group_member", {
      p_group_id: aGroup.id,
      p_contact_id: aContact.id,
    });

    const { error: rpcErr } = await userA.client.rpc("remove_group_member", {
      p_group_id: aGroup.id,
      p_contact_id: aContact.id,
    });
    expect(rpcErr).toBeNull();

    const { data: links } = await userA.client
      .from("contact_groups")
      .select("contact_id");
    expect(links).toEqual([]);
  });

  test("contact_groups select can embed the member Contact", async () => {
    // listMembers in GroupsClient relies on the postgrest embed
    // `contact:contacts!contact_id(...)`. This test pins that the
    // foreign-key relationship and embed actually work end-to-end.
    const { data: aGroup, error: gErr } = await adminClient
      .from("groups")
      .insert({ owner_id: userA.id, name: "circle" })
      .select("id")
      .single();
    if (gErr || !aGroup) throw new Error(gErr?.message);

    const { data: aContact, error: cErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Sam", email: "sam@x.com" })
      .select("id")
      .single();
    if (cErr || !aContact) throw new Error(cErr?.message);

    await userA.client.rpc("add_group_member", {
      p_group_id: aGroup.id,
      p_contact_id: aContact.id,
    });

    const { data, error } = await userA.client
      .from("contact_groups")
      .select("contact:contacts(id, name, email)")
      .eq("group_id", aGroup.id);
    expect(error).toBeNull();
    expect(data).toEqual([
      { contact: { id: aContact.id, name: "Sam", email: "sam@x.com" } },
    ]);
  });

  test("relationships select can embed the Group target", async () => {
    // listGroupRelationships in GroupsClient relies on the postgrest embed
    // `group:groups!target_group_id(...)`. Pin that the FK and embed are
    // wired up correctly end-to-end.
    const { data: aGroup, error: gErr } = await adminClient
      .from("groups")
      .insert({ owner_id: userA.id, name: "circle" })
      .select("id, name")
      .single();
    if (gErr || !aGroup) throw new Error(gErr?.message);

    const { data, error } = await userA.client
      .from("relationships")
      .select("target_type, group:groups(id, name)")
      .eq("target_type", "group");
    expect(error).toBeNull();
    expect(data).toEqual([
      {
        target_type: "group",
        group: { id: aGroup.id, name: "circle" },
      },
    ]);
  });

  test("contact_groups select can embed the Group AND its auto-paired Relationship", async () => {
    // listForContact in GroupsClient relies on the nested embed
    // `groups(..., relationships(...))`. Pin the multi-level embed works.
    const { data: aGroup, error: gErr } = await adminClient
      .from("groups")
      .insert({ owner_id: userA.id, name: "circle" })
      .select("id, name")
      .single();
    if (gErr || !aGroup) throw new Error(gErr?.message);

    const { data: aContact, error: cErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Sam" })
      .select("id")
      .single();
    if (cErr || !aContact) throw new Error(cErr?.message);

    await userA.client.rpc("add_group_member", {
      p_group_id: aGroup.id,
      p_contact_id: aContact.id,
    });

    const { data, error } = await userA.client
      .from("contact_groups")
      .select("group:groups(id, name, relationships(id))")
      .eq("contact_id", aContact.id);
    expect(error).toBeNull();
    expect(data).toEqual([
      {
        group: {
          id: aGroup.id,
          name: "circle",
          relationships: [{ id: expect.any(String) }],
        },
      },
    ]);
  });

  test("User A can rename their own Group", async () => {
    // 20260520000003_crud_rls_policies.sql added the UPDATE policy for groups.
    const { data: aGroup } = await adminClient
      .from("groups")
      .insert({ owner_id: userA.id, name: "old name" })
      .select("id")
      .single();
    if (!aGroup) throw new Error("no group");

    const { error: updateErr } = await userA.client
      .from("groups")
      .update({ name: "new name" })
      .eq("id", aGroup.id);
    expect(updateErr).toBeNull();

    const { data } = await userA.client
      .from("groups")
      .select("name")
      .eq("id", aGroup.id)
      .single();
    expect(data).toEqual({ name: "new name" });
  });

  test("User B cannot rename User A's Group", async () => {
    const { data: aGroup } = await adminClient
      .from("groups")
      .insert({ owner_id: userA.id, name: "untouchable" })
      .select("id")
      .single();
    if (!aGroup) throw new Error("no group");

    const { data: updated } = await userB.client
      .from("groups")
      .update({ name: "hijacked" })
      .eq("id", aGroup.id)
      .select("id");
    expect(updated).toEqual([]);

    const { data: view } = await adminClient
      .from("groups")
      .select("name")
      .eq("id", aGroup.id)
      .single();
    expect((view as any)?.name).toBe("untouchable");
  });

  test("User A can delete their own Group", async () => {
    const { data: aGroup } = await adminClient
      .from("groups")
      .insert({ owner_id: userA.id, name: "deletable" })
      .select("id")
      .single();
    if (!aGroup) throw new Error("no group");

    const { error: deleteErr } = await userA.client
      .from("groups")
      .delete()
      .eq("id", aGroup.id);
    expect(deleteErr).toBeNull();

    const { data } = await userA.client
      .from("groups")
      .select("id")
      .eq("id", aGroup.id);
    expect(data).toEqual([]);
  });

  test("User B cannot link their own Contact to User A's Group", async () => {
    // User A owns a Group; User B owns a Contact. The composite (id, owner)
    // FK on contact_groups must reject a cross-user link even when each side
    // exists.
    const { data: aGroup, error: aErr } = await adminClient
      .from("groups")
      .insert({ owner_id: userA.id, name: "A's circle" })
      .select("id")
      .single();
    if (aErr || !aGroup) throw new Error(aErr?.message ?? "no A group");

    const { data: bContact, error: bErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userB.id, name: "Bob" })
      .select("id")
      .single();
    if (bErr || !bContact) throw new Error(bErr?.message ?? "no B contact");

    const { error } = await userB.client.from("contact_groups").insert({
      contact_id: bContact.id,
      group_id: aGroup.id,
      owner_id: userB.id,
    });
    expect(error).not.toBeNull();
  });
});
