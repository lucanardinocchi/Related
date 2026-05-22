import {
  filterUserVisibleCandidateActions,
  initialDecisionStateForCandidateAction,
  isUserVisibleCandidateAction,
} from "./candidateSet";

describe("candidate visibility", () => {
  it("treats DoNothing as not user-visible", () => {
    expect(isUserVisibleCandidateAction("DoNothing")).toBe(false);
    expect(isUserVisibleCandidateAction("SendMessage")).toBe(true);
  });

  it("filters DoNothing from action lists", () => {
    expect(
      filterUserVisibleCandidateActions([
        { type: "DoNothing", id: "1" },
        { type: "OpenThread", id: "2" },
      ]),
    ).toEqual([{ type: "OpenThread", id: "2" }]);
  });

  it("auto-ignores DoNothing on persist", () => {
    expect(initialDecisionStateForCandidateAction("DoNothing")).toBe("ignored");
    expect(initialDecisionStateForCandidateAction("SendMessage")).toBe(
      "pending",
    );
  });
});
