import { innerCircleCloseness, CLOSENESS_WEIGHTS } from "./innerCircleAnalytics";
import type { Interaction } from "../interactions/InteractionsClient";
import type { OpenThread } from "../open-threads/OpenThreadsClient";
import type { Event } from "../events/EventsClient";

const now = new Date("2026-05-21T12:00:00Z");

function ix(over: Partial<Interaction>): Interaction {
  return {
    id: "ix-1",
    time: "2026-05-20T10:00:00Z",
    kind: "note",
    category: "personal",
    notes: null,
    status: "occurred",
    contacts: [{ id: "c1", name: "Alex" }],
    ...over,
  };
}

function ev(over: Partial<Event>): Event {
  return {
    id: "ev-1",
    title: "Coffee",
    start: "2026-05-20T10:00:00Z",
    end: "2026-05-20T11:00:00Z",
    isAllDay: false,
    location: null,
    aim: null,
    requiredPrep: null,
    status: "attended",
    type: "meeting",
    source: "manual",
    externalEventId: null,
    attendees: [{ id: "c1", name: "Alex" }],
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
  it("weights platform comms, events, notes, and commitments", () => {
    const result = innerCircleCloseness({
      contacts,
      contactIdByRelationshipId,
      platformComms: [
        { contactId: "c1", sentAt: "2026-05-20T10:00:00Z" },
        { contactId: "c1", sentAt: "2026-05-19T09:00:00Z" },
      ],
      events: [
        ev({
          status: "attended",
          start: "2026-05-18T10:00:00Z",
          attendees: [{ id: "c1", name: "Alex" }],
        }),
        ev({
          id: "ev-2",
          status: "planned",
          start: "2026-05-25T10:00:00Z",
          attendees: [{ id: "c2", name: "Blake" }],
        }),
      ],
      interactions: [
        ix({
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
        CLOSENESS_WEIGHTS.comms * 2 + CLOSENESS_WEIGHTS.attended,
      signals: {
        comms: 2,
        notes: 0,
        upcoming: 0,
        attended: 1,
        commitments: 0,
      },
      relativeCloseness: 100,
    });
    expect(result.contacts[1]).toMatchObject({
      contactId: "c2",
      score:
        CLOSENESS_WEIGHTS.upcoming +
        CLOSENESS_WEIGHTS.note +
        CLOSENESS_WEIGHTS.commitment,
      signals: {
        comms: 0,
        notes: 1,
        upcoming: 1,
        attended: 0,
        commitments: 1,
      },
    });
  });

  it("excludes touchpoints outside the window", () => {
    const result = innerCircleCloseness({
      contacts,
      contactIdByRelationshipId,
      platformComms: [
        { contactId: "c1", sentAt: "2026-04-01T10:00:00Z" },
      ],
      events: [],
      interactions: [],
      openThreads: [],
      windowDays: 7,
      now,
    });
    expect(result.contacts).toHaveLength(0);
  });

  it("includes all-time platform comms when windowDays is null", () => {
    const result = innerCircleCloseness({
      contacts,
      contactIdByRelationshipId,
      platformComms: [
        { contactId: "c1", sentAt: "2025-01-01T10:00:00Z" },
      ],
      events: [],
      interactions: [],
      openThreads: [],
      windowDays: null,
      now,
    });
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].score).toBe(CLOSENESS_WEIGHTS.comms);
  });

  it("ignores non-note interactions and counts closed commitments", () => {
    const result = innerCircleCloseness({
      contacts,
      contactIdByRelationshipId,
      platformComms: [],
      events: [],
      interactions: [
        ix({
          kind: "coffee",
          status: "occurred",
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
          comms: 0,
          notes: 0,
          upcoming: 0,
          attended: 0,
          commitments: 1,
        },
      }),
    ]);
  });
});
