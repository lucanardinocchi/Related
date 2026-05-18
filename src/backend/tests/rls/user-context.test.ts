import {
  adminClient,
  setupTestUsers,
  teardownTestUsers,
  TestUser,
} from "../helpers/test-clients";

/**
 * Slice 10 — User Context flavours. Goals & Values are append-many-rows
 * (each Goal/Value is its own row). Situational State is one row per User,
 * upserted on change (recency-of-change drives Salience per ADR-0002).
 */
describe("Goals & Values + Situational State RLS", () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeEach(async () => {
    [userA, userB] = await setupTestUsers(2);
  });

  afterEach(async () => {
    const ids = [userA.id, userB.id];
    await adminClient.from("goals_and_values").delete().in("owner_id", ids);
    await adminClient.from("situational_state").delete().in("owner_id", ids);
    await teardownTestUsers([userA, userB]);
  });

  test("User B cannot read User A's Goals & Values", async () => {
    await adminClient
      .from("goals_and_values")
      .insert({ owner_id: userA.id, content: "Be more present with family" });

    const { data, error } = await userB.client
      .from("goals_and_values")
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("User B cannot read User A's Situational State", async () => {
    await adminClient
      .from("situational_state")
      .insert({ owner_id: userA.id, content: "Just moved to Sydney" });

    const { data, error } = await userB.client
      .from("situational_state")
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("situational_state enforces one row per User (singleton)", async () => {
    const { error: e1 } = await adminClient
      .from("situational_state")
      .insert({ owner_id: userA.id, content: "first" });
    expect(e1).toBeNull();

    const { error: e2 } = await adminClient
      .from("situational_state")
      .insert({ owner_id: userA.id, content: "second" });
    expect(e2).not.toBeNull();
  });

  test("User A can author multiple Goals & Values rows", async () => {
    // Client must supply owner_id — matches the contacts pattern (no DB
    // default; RLS WITH CHECK confirms owner_id = auth.uid()).
    const { error: e1 } = await userA.client
      .from("goals_and_values")
      .insert({ owner_id: userA.id, content: "Be more present with family" });
    expect(e1).toBeNull();

    const { error: e2 } = await userA.client
      .from("goals_and_values")
      .insert({
        owner_id: userA.id,
        content: "Move slow, build deep relationships",
      });
    expect(e2).toBeNull();

    const { data } = await userA.client
      .from("goals_and_values")
      .select("content");
    expect((data ?? []).map((r) => r.content).sort()).toEqual(
      ["Be more present with family", "Move slow, build deep relationships"].sort(),
    );
  });
});
