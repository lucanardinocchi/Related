import {
  projectForAmbientPass,
  projectForConversationalTurn,
} from "./userContextProjections";

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

  it("projectForAmbientPass maps transient to string[] and relationships to otherRelationships", () => {
    const core = {
      asOf: "2026-05-19T00:00:00.000Z",
      goalsAndValues: [],
      situationalState: null,
      transientIntent: [
        { content: "plan dinner", capturedAt: "2026-05-19T00:00:00Z", relationshipId: null },
      ],
      groups: [],
      relationships: [
        {
          id: "r-2",
          targetType: "contact" as const,
          name: "Alex",
          role: null,
          cadence: null,
        },
      ],
      relationshipsTotal: 1,
    };
    const snapshot = projectForAmbientPass(core, {
      userId: "u-1",
      operatorStrengths: [],
      inferredSignals: {
        calendarDensity: null,
        sleep: null,
        calendarEvents: [],
        sleepRecords: [],
      },
      characterValuesAlignment: [],
    });
    expect(snapshot.transientIntent).toEqual(["plan dinner"]);
    expect(snapshot.otherRelationships).toHaveLength(1);
    expect(snapshot.userId).toBe("u-1");
  });
});
