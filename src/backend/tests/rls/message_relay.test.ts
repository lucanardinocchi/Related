import {
  adminClient,
  setupTestUsers,
  teardownTestUsers,
  TestUser,
} from "../helpers/test-clients";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("Message relay RLS", () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeEach(async () => {
    [userA, userB] = await setupTestUsers(2);
  });

  afterEach(async () => {
    const ids = [userA.id, userB.id];
    await adminClient.from("messages").delete().in("owner_id", ids);
    await adminClient.from("outbound_queue").delete().in("owner_id", ids);
    await adminClient.from("message_threads").delete().in("owner_id", ids);
    await adminClient.from("relay_devices").delete().in("owner_id", ids);
    await adminClient.from("relay_pairing_codes").delete().in("owner_id", ids);
    await teardownTestUsers([userA, userB]);
  });

  test("User A can select own message_threads; User B cannot see User A's threads", async () => {
    const externalChatId = `chat-${uniqueSuffix()}`;
    const { error: seedErr } = await adminClient.from("message_threads").insert({
      owner_id: userA.id,
      external_chat_id: externalChatId,
      display_name: "Sam",
    });
    expect(seedErr).toBeNull();

    const { data: aData, error: aErr } = await userA.client
      .from("message_threads")
      .select("external_chat_id, display_name");
    expect(aErr).toBeNull();
    expect(aData).toEqual([
      { external_chat_id: externalChatId, display_name: "Sam" },
    ]);

    const { data: bData, error: bErr } = await userB.client
      .from("message_threads")
      .select("id");
    expect(bErr).toBeNull();
    expect(bData).toEqual([]);
  });

  test("User A can insert outbound_queue; User B cannot read User A's queue", async () => {
    const { error: insertErr } = await userA.client.from("outbound_queue").insert({
      owner_id: userA.id,
      body: "Hey, are we still on for tonight?",
    });
    expect(insertErr).toBeNull();

    const { data: aData, error: aErr } = await userA.client
      .from("outbound_queue")
      .select("body, status");
    expect(aErr).toBeNull();
    expect(aData).toEqual([
      { body: "Hey, are we still on for tonight?", status: "pending" },
    ]);

    const { data: bData, error: bErr } = await userB.client
      .from("outbound_queue")
      .select("id");
    expect(bErr).toBeNull();
    expect(bData).toEqual([]);
  });

  test("User A can select own messages", async () => {
    const suffix = uniqueSuffix();
    const { data: thread, error: threadErr } = await adminClient
      .from("message_threads")
      .insert({
        owner_id: userA.id,
        external_chat_id: `chat-${suffix}`,
      })
      .select("id")
      .single();
    expect(threadErr).toBeNull();

    const { error: msgErr } = await adminClient.from("messages").insert({
      owner_id: userA.id,
      thread_id: thread!.id,
      external_message_id: `msg-${suffix}`,
      direction: "inbound",
      body: "See you at 7",
      sent_at: new Date().toISOString(),
    });
    expect(msgErr).toBeNull();

    const { data, error } = await userA.client
      .from("messages")
      .select("body, direction");
    expect(error).toBeNull();
    expect(data).toEqual([{ body: "See you at 7", direction: "inbound" }]);
  });

  test("User A cannot insert messages directly (relay uses service role)", async () => {
    const suffix = uniqueSuffix();
    const { data: thread, error: threadErr } = await adminClient
      .from("message_threads")
      .insert({
        owner_id: userA.id,
        external_chat_id: `chat-${suffix}`,
      })
      .select("id")
      .single();
    expect(threadErr).toBeNull();

    const { error } = await userA.client.from("messages").insert({
      owner_id: userA.id,
      thread_id: thread!.id,
      external_message_id: `msg-${suffix}`,
      direction: "outbound",
      body: "forged",
      sent_at: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  test("User A can update own message_threads (for linkThread)", async () => {
    const { data: contact, error: contactErr } = await adminClient
      .from("contacts")
      .insert({ owner_id: userA.id, name: "Maya" })
      .select("id")
      .single();
    expect(contactErr).toBeNull();

    const suffix = uniqueSuffix();
    const { data: thread, error: threadErr } = await adminClient
      .from("message_threads")
      .insert({
        owner_id: userA.id,
        external_chat_id: `chat-${suffix}`,
      })
      .select("id")
      .single();
    expect(threadErr).toBeNull();

    const { error: updateErr } = await userA.client
      .from("message_threads")
      .update({ contact_id: contact!.id, display_name: "Maya (iMessage)" })
      .eq("id", thread!.id);
    expect(updateErr).toBeNull();

    const { data, error } = await userA.client
      .from("message_threads")
      .select("contact_id, display_name")
      .eq("id", thread!.id)
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({
      contact_id: contact!.id,
      display_name: "Maya (iMessage)",
    });

    await adminClient.from("contacts").delete().eq("id", contact!.id);
  });

  test("relay_devices: User A can select own devices; cannot insert directly", async () => {
    const { error: seedErr } = await adminClient.from("relay_devices").insert({
      owner_id: userA.id,
      name: "MacBook",
      device_secret_hash: "hash-for-test",
    });
    expect(seedErr).toBeNull();

    const { data, error } = await userA.client
      .from("relay_devices")
      .select("name");
    expect(error).toBeNull();
    expect(data).toEqual([{ name: "MacBook" }]);

    const { error: insertErr } = await userA.client.from("relay_devices").insert({
      owner_id: userA.id,
      name: "Rogue Mac",
      device_secret_hash: "rogue-hash",
    });
    expect(insertErr).not.toBeNull();
    expect(insertErr!.code).toBe("42501");
  });
});
