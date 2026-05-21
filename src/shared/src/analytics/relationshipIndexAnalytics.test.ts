import {
  averageInteractionsAmongTopContacts,
  groupsAddedPerWeek,
  interactionsPerWeekByRelationshipAge,
  peopleAddedPerWeek,
} from "./relationshipIndexAnalytics";
import type { Interaction } from "../interactions/InteractionsClient";

function ix(over: Partial<Interaction>): Interaction {
  return {
    id: "ix-1",
    time: "2026-05-20T10:00:00Z",
    kind: "coffee",
    category: "personal",
    notes: null,
    status: "occurred",
    contacts: [{ id: "c1", name: "Alex" }],
    ...over,
  };
}

describe("peopleAddedPerWeek", () => {
  it("buckets contact createdAt by week start", () => {
    const buckets = peopleAddedPerWeek({
      createdAts: [
        "2026-05-19T12:00:00Z",
        "2026-05-20T10:00:00Z",
        "2026-05-26T10:00:00Z",
      ],
      from: "2026-05-19T00:00:00Z",
      to: "2026-05-26T00:00:00Z",
    });
    expect(buckets).toEqual([
      { weekStart: "2026-05-18", count: 2 },
      { weekStart: "2026-05-25", count: 1 },
    ]);
  });
});

describe("groupsAddedPerWeek", () => {
  it("matches people bucketing for group createdAt", () => {
    const buckets = groupsAddedPerWeek({
      createdAts: ["2026-05-20T10:00:00Z"],
      from: "2026-05-19T00:00:00Z",
      to: "2026-05-26T00:00:00Z",
    });
    expect(buckets[0].count).toBe(1);
  });
});

describe("interactionsPerWeekByRelationshipAge", () => {
  const relCreated = { c1: "2026-01-01T00:00:00Z" };

  it("splits occurred interactions by tenure at interaction time", () => {
    const buckets = interactionsPerWeekByRelationshipAge({
      interactions: [
        ix({
          id: "1",
          time: "2026-05-20T10:00:00Z",
          contacts: [{ id: "c1", name: "Alex" }],
        }),
        ix({
          id: "2",
          time: "2026-05-20T14:00:00Z",
          status: "planned",
          contacts: [{ id: "c1", name: "Alex" }],
        }),
      ],
      relationshipCreatedAtByContactId: relCreated,
      from: "2026-05-19T00:00:00Z",
      to: "2026-05-26T00:00:00Z",
    });
    expect(buckets[0]).toEqual({
      weekStart: "2026-05-18",
      new: 0,
      growing: 1,
      established: 0,
      longTerm: 0,
    });
  });

  it("classifies new relationships under 30 days", () => {
    const buckets = interactionsPerWeekByRelationshipAge({
      interactions: [
        ix({
          time: "2026-05-20T10:00:00Z",
          contacts: [{ id: "c1", name: "Alex" }],
        }),
      ],
      relationshipCreatedAtByContactId: { c1: "2026-05-10T00:00:00Z" },
      from: "2026-05-19T00:00:00Z",
      to: "2026-05-26T00:00:00Z",
    });
    expect(buckets[0].new).toBe(1);
  });
});

describe("averageInteractionsAmongTopContacts", () => {
  const now = new Date("2026-05-21T12:00:00Z");

  it("averages counts among top N contacts in the window", () => {
    const result = averageInteractionsAmongTopContacts({
      interactions: [
        ix({
          id: "1",
          time: "2026-05-20T10:00:00Z",
          contacts: [{ id: "a", name: "A" }],
        }),
        ix({
          id: "2",
          time: "2026-05-19T10:00:00Z",
          contacts: [{ id: "a", name: "A" }],
        }),
        ix({
          id: "3",
          time: "2026-05-18T10:00:00Z",
          contacts: [{ id: "b", name: "B" }],
        }),
      ],
      windowDays: 7,
      topN: 2,
      now,
    });
    expect(result.average).toBe(1.5);
  });

  it("returns null when no occurred interactions in window", () => {
    const result = averageInteractionsAmongTopContacts({
      interactions: [],
      windowDays: 7,
      now,
    });
    expect(result.average).toBeNull();
  });
});
