import {
  adminClient,
  setupTestUsers,
  teardownTestUsers,
  TestUser,
} from "../helpers/test-clients";

describe("User subscriptions RLS", () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeEach(async () => {
    [userA, userB] = await setupTestUsers(2);
  });

  afterEach(async () => {
    const ids = [userA.id, userB.id];
    await adminClient.from("user_subscriptions").delete().in("owner_id", ids);
    await teardownTestUsers([userA, userB]);
  });

  test("User can read own subscription row", async () => {
    await adminClient.from("user_subscriptions").insert({
      owner_id: userA.id,
      stripe_customer_id: "cus_test_a",
      status: "active",
    });

    const { data, error } = await userA.client
      .from("user_subscriptions")
      .select("status, stripe_customer_id")
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.status).toBe("active");
    expect(data?.stripe_customer_id).toBe("cus_test_a");
  });

  test("User B cannot read User A subscription", async () => {
    await adminClient.from("user_subscriptions").insert({
      owner_id: userA.id,
      stripe_customer_id: "cus_test_a",
      status: "active",
    });

    const { data, error } = await userB.client
      .from("user_subscriptions")
      .select("status");

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  test("User cannot insert or update subscription via client", async () => {
    const { error: insertError } = await userA.client
      .from("user_subscriptions")
      .insert({
        owner_id: userA.id,
        stripe_customer_id: "cus_hack",
        status: "active",
      });
    expect(insertError).not.toBeNull();

    await adminClient.from("user_subscriptions").insert({
      owner_id: userA.id,
      stripe_customer_id: "cus_test_a",
      status: "inactive",
    });

    const { error: updateError } = await userA.client
      .from("user_subscriptions")
      .update({ status: "active" })
      .eq("owner_id", userA.id);
    expect(updateError).not.toBeNull();
  });
});
