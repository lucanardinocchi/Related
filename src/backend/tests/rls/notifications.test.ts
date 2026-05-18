import {
  adminClient,
  setupTestUsers,
  teardownTestUsers,
  TestUser,
} from "../helpers/test-clients";

describe("Notifications RLS — subscriptions + preferences", () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeEach(async () => {
    [userA, userB] = await setupTestUsers(2);
  });

  afterEach(async () => {
    const ids = [userA.id, userB.id];
    await adminClient.from("push_subscriptions").delete().in("owner_id", ids);
    await adminClient.from("notification_preferences").delete().in("owner_id", ids);
    await teardownTestUsers([userA, userB]);
  });

  test("User B cannot read User A's push subscriptions", async () => {
    await adminClient.from("push_subscriptions").insert({
      owner_id: userA.id,
      token: "ExponentPushToken[abc]",
      platform: "ios",
    });
    const { data, error } = await userB.client
      .from("push_subscriptions")
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("push_subscriptions enforces unique (owner_id, token) so re-registration upserts cleanly", async () => {
    const { error: e1 } = await adminClient.from("push_subscriptions").insert({
      owner_id: userA.id,
      token: "ExponentPushToken[abc]",
      platform: "ios",
    });
    expect(e1).toBeNull();
    const { error: e2 } = await adminClient.from("push_subscriptions").insert({
      owner_id: userA.id,
      token: "ExponentPushToken[abc]",
      platform: "ios",
    });
    expect(e2).not.toBeNull();
  });

  test("notification_preferences is singleton per User and User B cannot read User A's prefs", async () => {
    await adminClient.from("notification_preferences").insert({
      owner_id: userA.id,
      enabled: true,
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
    });
    const { error: dup } = await adminClient.from("notification_preferences").insert({
      owner_id: userA.id,
      enabled: false,
    });
    expect(dup).not.toBeNull();

    const { data } = await userB.client
      .from("notification_preferences")
      .select("enabled");
    expect(data).toEqual([]);
  });
});
