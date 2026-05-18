import { UserContextBuilder } from "./UserContextBuilder";

describe("UserContextBuilder.buildUserContext", () => {
  it("returns an empty snapshot in this slice (interface + call path only)", async () => {
    const builder = new UserContextBuilder();
    const snapshot = await builder.buildUserContext("u-1", new Date("2026-05-19T00:00:00Z"));

    // The four flavours each exist on the snapshot but are empty until later
    // slices populate them (Slice 10: Goals+Situational, 11: Calendar, etc).
    expect(snapshot).toEqual({
      userId: "u-1",
      asOf: "2026-05-19T00:00:00.000Z",
      transientIntent: [],
      situationalState: [],
      goalsAndValues: [],
      inferredSignals: { calendarDensity: null, sleep: null },
    });
  });
});
