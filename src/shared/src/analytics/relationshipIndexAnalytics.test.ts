import {
  averageInteractionsAmongTopContacts,
  averageInteractionsByRelationshipAge,
  groupsAddedPerDay,
  peopleAddedPerDay,
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

describe("peopleAddedPerDay", () => {
  it("buckets contact createdAt by calendar day", () => {
    const buckets = peopleAddedPerDay({
      createdAts: [
        "2026-05-19T12:00:00Z",
        "2026-05-20T10:00:00Z",
        "2026-05-20T18:00:00Z",
      ],
      from: "2026-05-19T00:00:00Z",
      to: "2026-05-21T00:00:00Z",
    });
    expect(buckets).toEqual([
      { date: "2026-05-19", count: 1 },
      { date: "2026-05-20", count: 2 },
      { date: "2026-05-21", count: 0 },
    ]);
  });
});

describe("groupsAddedPerDay", () => {
  it("matches people bucketing for group createdAt", () => {
    const buckets = groupsAddedPerDay({
      createdAts: ["2026-05-20T10:00:00Z"],
      from: "2026-05-19T00:00:00Z",
      to: "2026-05-21T00:00:00Z",
    });
    expect(buckets.find((b) => b.date === "2026-05-20")?.count).toBe(1);
  });
});

describe("averageInteractionsByRelationshipAge", () => {
  it("averages occurred interactions per relationship by tenure band", () => {
    const buckets = averageInteractionsByRelationshipAge({
      interactions: [
        ix({
          id: "1",
          time: "2026-05-20T10:00:00Z",
          contacts: [{ id: "c1", name: "Alex" }],
        }),
        ix({
          id: "2",
          time: "2026-05-20T14:00:00Z",
          contacts: [{ id: "c1", name: "Alex" }],
        }),
        ix({
          id: "3",
          time: "2026-05-19T10:00:00Z",
          contacts: [{ id: "c2", name: "Blake" }],
        }),
        ix({
          id: "4",
          time: "2026-05-19T12:00:00Z",
          status: "planned",
          contacts: [{ id: "c2", name: "Blake" }],
        }),
      ],
      relationshipCreatedAtByContactId: {
        c1: "2026-01-01T00:00:00Z",
        c2: "2026-05-10T00:00:00Z",
      },
      from: "2026-05-18T00:00:00Z",
      to: "2026-05-21T00:00:00Z",
    });

    expect(buckets).toEqual([
      { band: "new", averageInteractions: 1, relationshipCount: 1 },
      { band: "growing", averageInteractions: 2, relationshipCount: 1 },
      { band: "established", averageInteractions: null, relationshipCount: 0 },
      { band: "longTerm", averageInteractions: null, relationshipCount: 0 },
    ]);
  });

  it("includes relationships with zero interactions in the average", () => {
    const buckets = averageInteractionsByRelationshipAge({
      interactions: [
        ix({
          time: "2026-05-20T10:00:00Z",
          contacts: [{ id: "c1", name: "Alex" }],
        }),
      ],
      relationshipCreatedAtByContactId: {
        c1: "2026-05-10T00:00:00Z",
        c2: "2026-05-12T00:00:00Z",
      },
      from: "2026-05-18T00:00:00Z",
      to: "2026-05-21T00:00:00Z",
    });

    expect(buckets[0]).toEqual({
      band: "new",
      averageInteractions: 0.5,
      relationshipCount: 2,
    });
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
