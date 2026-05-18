import {
  adminClient,
  setupTestUsers,
  teardownTestUsers,
  TestUser,
} from "../helpers/test-clients";

describe("TransientIntent RLS + decay semantics", () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeEach(async () => {
    [userA, userB] = await setupTestUsers(2);
  });

  afterEach(async () => {
    const ids = [userA.id, userB.id];
    await adminClient.from("transient_intent").delete().in("owner_id", ids);
    await teardownTestUsers([userA, userB]);
  });

  test("User B cannot read User A's transient intent", async () => {
    await adminClient.from("transient_intent").insert({
      owner_id: userA.id,
      session_id: "sess-1",
      content: "Plan my birthday",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    const { data, error } = await userB.client
      .from("transient_intent")
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("query for non-expired intents in a session filters out expired rows", async () => {
    const live = await adminClient.from("transient_intent").insert({
      owner_id: userA.id,
      session_id: "sess-1",
      content: "live intent",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(live.error).toBeNull();

    const expired = await adminClient.from("transient_intent").insert({
      owner_id: userA.id,
      session_id: "sess-1",
      content: "old intent",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(expired.error).toBeNull();

    const { data } = await userA.client
      .from("transient_intent")
      .select("content, expires_at")
      .eq("session_id", "sess-1")
      .gt("expires_at", new Date().toISOString());
    expect((data ?? []).map((r) => r.content)).toEqual(["live intent"]);
  });
});
