import { inferCandidateExecuted } from "./inferCandidateExecution";
import { testRelationshipContextSnapshot } from "./relationshipContextFixtures";

describe("inferCandidateExecuted", () => {
  const base = testRelationshipContextSnapshot();

  it("returns null when not picked", () => {
    expect(
      inferCandidateExecuted("OpenThread", {}, "declined", null, {
        relationship: base.relationship,
        interactions: base.interactions,
        openThreads: base.openThreads,
      }),
    ).toBeNull();
  });

  it("returns true for SendMessage when picked", () => {
    expect(
      inferCandidateExecuted("SendMessage", {}, "picked", "2026-05-20T00:00:00Z", {
        relationship: base.relationship,
        interactions: base.interactions,
        openThreads: base.openThreads,
      }),
    ).toBe(true);
  });

  it("detects LogInteraction when a matching interaction exists after decision", () => {
    const ctx = testRelationshipContextSnapshot({
      interactions: [
        {
          id: "i-1",
          time: "2026-05-18T20:00:00Z",
          kind: "coffee",
          category: "personal",
          notes: null,
          status: "occurred",
          group_id: null,
          created_at: "2026-05-20T01:00:00Z",
          updated_at: "2026-05-20T01:00:00Z",
          interaction_contacts: [{ contact_id: "c-1", contacts: { id: "c-1", name: "Sam" } }],
        },
      ],
    });
    expect(
      inferCandidateExecuted(
        "LogInteraction",
        { time: "2026-05-18T20:00:00Z", kind: "coffee", contactIds: ["c-1"] },
        "picked",
        "2026-05-20T00:00:00Z",
        {
          relationship: ctx.relationship,
          interactions: ctx.interactions,
          openThreads: ctx.openThreads,
        },
      ),
    ).toBe(true);
  });
});
