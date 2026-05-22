import {
  AMBIENT_PASS_USER_CONTEXT_FLAVOURS,
  CONVERSATIONAL_USER_CONTEXT_FLAVOURS,
  projectForAmbientPass,
  projectForConversationalTurn,
} from "./userContextProjections";

describe("userContextProjections", () => {
  const core = {
    asOf: "2026-05-19T00:00:00.000Z",
    goalsAndValues: [{ id: "g-1", content: "Be present", createdAt: "", updatedAt: "" }],
    situationalState: { id: "ss-1", content: "New city", createdAt: "", updatedAt: "" },
    transientIntent: [{ content: "Plan birthday", capturedAt: "2026-05-18T00:00:00Z", relationshipId: "r-2" }],
    groups: [{ id: "grp-1", name: "College", memberCount: 3, createdAt: "" }],
    relationships: [{ id: "r-2", targetType: "contact" as const, name: "Sam", role: null, cadence: null }],
    relationshipsTotal: 1,
  };
  const ambientExtras = {
    userId: "u-1",
    operatorStrengths: [{ id: "os-1", content: "coaching", createdAt: "", updatedAt: "" }],
    inferredSignals: { calendarDensity: null, sleep: null, calendarEvents: [], sleepRecords: [] },
    characterValuesAlignment: [],
  };

  it("projectForConversationalTurn exposes documented flavours", () => {
    expect(Object.keys(projectForConversationalTurn(core).userContext).sort()).toEqual(
      [...CONVERSATIONAL_USER_CONTEXT_FLAVOURS].sort(),
    );
  });

  it("projectForAmbientPass includes all five flavours", () => {
    const snapshot = projectForAmbientPass(core, ambientExtras);
    for (const flavour of AMBIENT_PASS_USER_CONTEXT_FLAVOURS) expect(snapshot).toHaveProperty(flavour);
    expect(snapshot.transientIntent).toEqual(["Plan birthday"]);
    expect(snapshot.inferredSignals).toEqual(ambientExtras.inferredSignals);
  });
});
