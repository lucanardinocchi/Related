import { relationshipAnalytics } from "./relationshipAnalytics";
import type { Interaction } from "../interactions/InteractionsClient";
import type { OpenThread } from "../open-threads/OpenThreadsClient";

function interaction(over: Partial<Interaction>): Interaction {
  return {
    id: "i-1",
    time: "2026-05-15T10:00:00Z",
    kind: "coffee",
    category: "personal",
    notes: null,
    status: "occurred",
    contacts: [{ id: "c-1", name: "Sam" }],
    ...over,
  };
}

function thread(over: Partial<OpenThread>): OpenThread {
  return {
    id: "ot-1",
    description: "x",
    direction: "me_owes_them",
    origin: null,
    communicationStatus: "not_communicated",
    createdAt: "2026-05-01T00:00:00Z",
    closedAt: null,
    relationshipIds: ["r-1"],
    ...over,
  };
}

describe("relationshipAnalytics", () => {
  const now = new Date("2026-05-20T12:00:00Z");

  it("counts only occurred interactions and ignores planned/missed", () => {
    const result = relationshipAnalytics({
      interactions: [
        interaction({ id: "i-1", status: "occurred", time: "2026-05-15T10:00:00Z" }),
        interaction({ id: "i-2", status: "planned", time: "2026-06-01T10:00:00Z" }),
        interaction({ id: "i-3", status: "missed", time: "2026-05-10T10:00:00Z" }),
      ],
      openThreads: [],
      now,
    });
    expect(result.totalInteractions).toBe(1);
  });

  it("counts interactions within the trailing 30 days", () => {
    const result = relationshipAnalytics({
      interactions: [
        interaction({ id: "i-1", time: "2026-05-15T10:00:00Z" }),
        interaction({ id: "i-2", time: "2026-04-25T10:00:00Z" }),
        interaction({ id: "i-3", time: "2026-04-15T10:00:00Z" }),
      ],
      openThreads: [],
      now,
    });
    expect(result.interactionsLast30Days).toBe(2);
  });

  it("reports lastInteractionAt and daysSinceLastInteraction", () => {
    const result = relationshipAnalytics({
      interactions: [
        interaction({ id: "i-1", time: "2026-05-15T12:00:00Z" }),
        interaction({ id: "i-2", time: "2026-05-10T12:00:00Z" }),
      ],
      openThreads: [],
      now,
    });
    expect(result.lastInteractionAt).toBe("2026-05-15T12:00:00Z");
    expect(result.daysSinceLastInteraction).toBe(5);
  });

  it("returns null lastInteractionAt when no occurred interactions exist", () => {
    const result = relationshipAnalytics({
      interactions: [
        interaction({ status: "planned", time: "2026-06-01T10:00:00Z" }),
      ],
      openThreads: [],
      now,
    });
    expect(result.lastInteractionAt).toBeNull();
    expect(result.daysSinceLastInteraction).toBeNull();
  });

  it("separates open commitments from open threads", () => {
    const result = relationshipAnalytics({
      interactions: [],
      openThreads: [
        thread({ id: "ot-1", direction: "me_owes_them", closedAt: null }),
        thread({ id: "ot-2", direction: "me_owes_them", closedAt: "2026-05-19" }),
        thread({ id: "ot-3", direction: "they_owe_me", closedAt: null }),
      ],
      now,
    });
    expect(result.openCommitments).toBe(1);
    expect(result.openThreads).toBe(2);
  });
});
