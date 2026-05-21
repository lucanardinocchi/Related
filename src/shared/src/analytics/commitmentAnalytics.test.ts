import { commitmentAnalytics } from "./commitmentAnalytics";
import type { OpenThread } from "../open-threads/OpenThreadsClient";

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
    whyHelpsPerson: null,
    whyICanHelp: null,
    ...over,
  };
}

describe("commitmentAnalytics", () => {
  it("counts origin and communication_status breakdowns and crosstab", () => {
    const result = commitmentAnalytics({
      commitments: [
        thread({ id: "1", origin: "asked_of_me", communicationStatus: "confirmed" }),
        thread({ id: "2", origin: "asked_of_me", communicationStatus: "confirmed" }),
        thread({ id: "3", origin: "self_led", communicationStatus: "not_communicated" }),
        thread({ id: "4", origin: "self_led", communicationStatus: "confirmed" }),
        thread({ id: "5", origin: null, communicationStatus: "not_communicated" }),
      ],
    });
    expect(result.total).toBe(5);
    expect(result.byOrigin).toEqual({ askedOfMe: 2, selfLed: 2, unset: 1 });
    expect(result.byCommunicationStatus).toEqual({
      confirmed: 3,
      notCommunicated: 2,
    });
    expect(result.crosstab).toEqual({
      asked_of_me: { confirmed: 2, not_communicated: 0 },
      self_led: { confirmed: 1, not_communicated: 1 },
    });
  });

  it("returns zeroed counts for an empty list", () => {
    const result = commitmentAnalytics({ commitments: [] });
    expect(result.total).toBe(0);
    expect(result.byOrigin).toEqual({ askedOfMe: 0, selfLed: 0, unset: 0 });
  });
});
