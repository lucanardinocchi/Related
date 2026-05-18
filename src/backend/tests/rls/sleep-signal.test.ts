import {
  adminClient,
  setupTestUsers,
  teardownTestUsers,
  TestUser,
} from "../helpers/test-clients";

describe("InferredSignal_Sleep RLS", () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeEach(async () => {
    [userA, userB] = await setupTestUsers(2);
  });

  afterEach(async () => {
    const ids = [userA.id, userB.id];
    await adminClient.from("inferred_signal_sleep").delete().in("owner_id", ids);
    await teardownTestUsers([userA, userB]);
  });

  test("User B cannot read User A's sleep records", async () => {
    await adminClient.from("inferred_signal_sleep").insert({
      owner_id: userA.id,
      record_id: "hk-1",
      started_at: "2026-05-18T22:00:00Z",
      ended_at: "2026-05-19T06:00:00Z",
      duration_minutes: 480,
      quality: "deep",
    });

    const { data, error } = await userB.client
      .from("inferred_signal_sleep")
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("inferred_signal_sleep enforces unique (owner_id, record_id) so re-pulls upsert cleanly", async () => {
    const { error: e1 } = await adminClient.from("inferred_signal_sleep").insert({
      owner_id: userA.id,
      record_id: "hk-1",
      started_at: "2026-05-18T22:00:00Z",
      ended_at: "2026-05-19T06:00:00Z",
      duration_minutes: 480,
    });
    expect(e1).toBeNull();
    const { error: e2 } = await adminClient.from("inferred_signal_sleep").insert({
      owner_id: userA.id,
      record_id: "hk-1",
      started_at: "2026-05-18T22:00:00Z",
      ended_at: "2026-05-19T06:30:00Z",
      duration_minutes: 510,
    });
    expect(e2).not.toBeNull();
  });
});
