import { innerCircleCloseness, CLOSENESS_WEIGHTS } from "./innerCircleAnalytics";
import type { Interaction } from "../interactions/InteractionsClient";
import type { OpenThread } from "../open-threads/OpenThreadsClient";

const now = new Date("2026-05-21T12:00:00Z");

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

function thread(over: Partial<OpenThread>): OpenThread {
  return {
    id: "t1",
    description: "follow up",
    direction: "me_owes_them",
    origin: null,
    communicationStatus: "not_communicated",
    createdAt: "2026-05-19T10:00:00Z",
    closedAt: null,
    whyHelpsPerson: null,
    whyICanHelp: null,
    relationshipIds: ["rel-1"],
    ...over,
  };
}

const contacts = [
  { contactId: "c1", relationshipId: "rel-1", name: "Alex" },
  { contactId: "c2", relationshipId: "rel-2", name: "Blake" },
];

const contactIdByRelationshipId = {
  "rel-1": "c1",
  "rel-2": "c2",
};

describe("innerCircleCloseness", () => {
  it("weights interactions, comms, notes, and commitments", () => {
    const result = innerCircleCloseness({
      contacts,
      contactIdByRelationshipId,
      interactions: [
        ix({
          time: "2026-05-20T10:00:00Z",
          contacts: [{ id: "c1", name: "Alex" }],
        }),
        ix({
          id: "ix-2",
          kind: "imessage",
          contacts: [{ id: "c1", name: "Alex" }],
        }),
        ix({
          id: "ix-3",
          kind: "note",
          contacts: [{ id: "c2", name: "Blake" }],
        }),
      ],
      openThreads: [thread({ relationshipIds: ["rel-2"] })],
      windowDays: 30,
      now,
    });

    expect(result.contacts[0]).toMatchObject({
      contactId: "c1",
      score:
        CLOSENESS_WEIGHTS.interaction + CLOSENESS_WEIGHTS.comms,
      signals: { interactions: 1, comms: 1, notes: 0, commitments: 0 },
      relativeCloseness: 100,
    });
    expect(result.contacts[1]).toMatchObject({
      contactId: "c2",
      score: CLOSENESS_WEIGHTS.note + CLOSENESS_WEIGHTS.commitment,
      signals: { interactions: 0, comms: 0, notes: 1, commitments: 1 },
    });
  });

  it("excludes touchpoints outside the window", () => {
    const result = innerCircleCloseness({
      contacts,
      contactIdByRelationshipId,
      interactions: [
        ix({
          time: "2026-04-01T10:00:00Z",
          contacts: [{ id: "c1", name: "Alex" }],
        }),
      ],
      openThreads: [],
      windowDays: 7,
      now,
    });
    expect(result.contacts).toHaveLength(0);
  });

  it("includes all-time history when windowDays is null", () => {
    const result = innerCircleCloseness({
      contacts,
      contactIdByRelationshipId,
      interactions: [
        ix({
          time: "2025-01-01T10:00:00Z",
          contacts: [{ id: "c1", name: "Alex" }],
        }),
      ],
      openThreads: [],
      windowDays: null,
      now,
    });
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].score).toBe(CLOSENESS_WEIGHTS.interaction);
  });

  it("ignores planned interactions and counts closed commitments", () => {
    const result = innerCircleCloseness({
      contacts,
      contactIdByRelationshipId,
      interactions: [
        ix({
          status: "planned",
          contacts: [{ id: "c1", name: "Alex" }],
        }),
      ],
      openThreads: [
        thread({
          createdAt: "2026-05-18T10:00:00Z",
          closedAt: "2026-05-19T10:00:00Z",
          relationshipIds: ["rel-1"],
        }),
      ],
      windowDays: 30,
      now,
    });
    expect(result.contacts).toEqual([
      expect.objectContaining({
        contactId: "c1",
        score: CLOSENESS_WEIGHTS.commitment,
        signals: {
          interactions: 0,
          comms: 0,
          notes: 0,
          commitments: 1,
        },
      }),
    ]);
  });
});
