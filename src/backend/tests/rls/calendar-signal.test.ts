import {
  adminClient,
  setupTestUsers,
  teardownTestUsers,
  TestUser,
} from "../helpers/test-clients";

describe("InferredSignal_Calendar RLS", () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeEach(async () => {
    [userA, userB] = await setupTestUsers(2);
  });

  afterEach(async () => {
    const ids = [userA.id, userB.id];
    await adminClient.from("inferred_signal_calendar").delete().in("owner_id", ids);
    await teardownTestUsers([userA, userB]);
  });

  test("User B cannot read User A's calendar events", async () => {
    await adminClient.from("inferred_signal_calendar").insert({
      owner_id: userA.id,
      event_id: "evt-1",
      title: "Dinner with Sam",
      start: "2026-05-20T19:00:00Z",
      end: "2026-05-20T21:00:00Z",
      is_all_day: false,
    });

    const { data, error } = await userB.client
      .from("inferred_signal_calendar")
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("inferred_signal_calendar enforces unique (owner_id, event_id) so re-pulls upsert cleanly", async () => {
    const { error: e1 } = await adminClient
      .from("inferred_signal_calendar")
      .insert({
        owner_id: userA.id,
        event_id: "evt-1",
        title: "Coffee",
        start: "2026-05-20T09:00:00Z",
        end: "2026-05-20T10:00:00Z",
        is_all_day: false,
      });
    expect(e1).toBeNull();
    const { error: e2 } = await adminClient
      .from("inferred_signal_calendar")
      .insert({
        owner_id: userA.id,
        event_id: "evt-1",
        title: "Coffee (rescheduled)",
        start: "2026-05-20T10:00:00Z",
        end: "2026-05-20T11:00:00Z",
        is_all_day: false,
      });
    expect(e2).not.toBeNull();
  });
});
