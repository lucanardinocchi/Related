import { projectForAmbientPass, projectForConversationalTurn } from "./userContextProjections";

describe("userContextProjections", () => {
  it("projectForConversationalTurn strips goals to content strings", () => {
    const core = {
      asOf: "2026-05-19T00:00:00.000Z",
      goalsAndValues: [
        {
          id: "g-1",
          content: "Be present",
          createdAt: "2026-05-01T00:00:00Z",
          updatedAt: "2026-05-01T00:00:00Z",
        },
      ],
      situationalState: {
        id: "ss-1",
        content: "New city",
        createdAt: "2026-05-01T00:00:00Z",
        updatedAt: "2026-05-02T00:00:00Z",
      },
      transientIntent: [],
      groups: [],
      relationships: [],
      relationshipsTotal: 0,
    };
    const projected = projectForConversationalTurn(core);
    expect(projected.userContext.goalsAndValues).toEqual(["Be present"]);
    expect(projected.userContext.situationalState).toBe("New city");
  });

  it("projectForAmbientPass keeps only goals, situational, and operator strengths", () => {
    const core = {
      asOf: "2026-05-19T00:00:00.000Z",
      goalsAndValues: [],
      situationalState: null,
      transientIntent: [],
      groups: [],
      relationships: [],
      relationshipsTotal: 0,
    };
    const snapshot = projectForAmbientPass(core, {
      userId: "u-1",
      operatorStrengths: [{ id: "os-1", content: "coaching", createdAt: "", updatedAt: "" }],
    });
    expect(snapshot).toEqual({
      userId: "u-1",
      asOf: "2026-05-19T00:00:00.000Z",
      goalsAndValues: [],
      situationalState: null,
      operatorStrengths: [
        { id: "os-1", content: "coaching", createdAt: "", updatedAt: "" },
      ],
    });
  });
});
