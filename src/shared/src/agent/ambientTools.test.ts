import { ensureDoNothingPeer } from "./ambientTools";

describe("ensureDoNothingPeer", () => {
  it("defaults to DoNothing when the model emits no actions", () => {
    expect(ensureDoNothingPeer([])).toEqual([{ type: "DoNothing", payload: {} }]);
  });

  it("returns a single action unchanged", () => {
    const action = {
      type: "ScheduleInteraction",
      payload: { time: "2026-05-22T17:00:00Z" },
      why: "birthday week",
    };
    expect(ensureDoNothingPeer([action])).toEqual([action]);
  });

  it("keeps the first non-DoNothing when multiple actions are returned", () => {
    expect(
      ensureDoNothingPeer([
        { type: "DoNothing", payload: {}, why: "fallback" },
        { type: "SendMessage", payload: { body: "hey" } },
        { type: "OpenThread", payload: { description: "follow up" } },
      ]),
    ).toEqual([{ type: "SendMessage", payload: { body: "hey" } }]);
  });

  it("keeps the first action when every action is DoNothing", () => {
    expect(
      ensureDoNothingPeer([
        { type: "DoNothing", payload: {}, why: "first" },
        { type: "DoNothing", payload: {}, why: "second" },
      ]),
    ).toEqual([{ type: "DoNothing", payload: {}, why: "first" }]);
  });
});
