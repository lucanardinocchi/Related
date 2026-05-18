import {
  adminClient,
  setupTestUsers,
  teardownTestUsers,
  TestUser,
} from "../helpers/test-clients";

describe("OnboardingState RLS + singleton", () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeEach(async () => {
    [userA, userB] = await setupTestUsers(2);
  });

  afterEach(async () => {
    const ids = [userA.id, userB.id];
    await adminClient.from("onboarding_state").delete().in("owner_id", ids);
    await teardownTestUsers([userA, userB]);
  });

  test("User B cannot read User A's onboarding state", async () => {
    await adminClient.from("onboarding_state").insert({
      owner_id: userA.id,
      completed_steps: ["welcome"],
    });
    const { data, error } = await userB.client
      .from("onboarding_state")
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("onboarding_state is singleton per User", async () => {
    const { error: e1 } = await adminClient
      .from("onboarding_state")
      .insert({ owner_id: userA.id });
    expect(e1).toBeNull();
    const { error: e2 } = await adminClient
      .from("onboarding_state")
      .insert({ owner_id: userA.id });
    expect(e2).not.toBeNull();
  });
});
