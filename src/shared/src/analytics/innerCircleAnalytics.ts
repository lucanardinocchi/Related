import type { PlatformCommsTouchpoint } from "../comms/CommsPlatformMessagesClient";
import type { Event } from "../events/EventsClient";
import type { Interaction } from "../interactions/InteractionsClient";
import type { OpenThread } from "../open-threads/OpenThreadsClient";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Points per touchpoint type — tuned for comparable scale across signals. */
export const CLOSENESS_WEIGHTS = {
  comms: 2,
  note: 2,
  upcoming: 2,
  attended: 3,
  commitment: 2,
} as const;

export interface ClosenessSignalCounts {
  comms: number;
  notes: number;
  upcoming: number;
  attended: number;
  commitments: number;
}

export interface InnerCircleContact {
  contactId: string;
  relationshipId: string;
  name: string;
  score: number;
  signals: ClosenessSignalCounts;
  /** 0–100 vs the top contact in this result set. */
  relativeCloseness: number;
}

export interface InnerCircleRankings {
  /** `null` = all-time; otherwise rolling window ending at `now`. */
  windowDays: number | null;
  contacts: InnerCircleContact[];
}

export interface InnerCircleContactInput {
  contactId: string;
  relationshipId: string;
  name: string;
}

function isNoteKind(kind: string): boolean {
  return kind === "note";
}

/** Rolling window: past `windowDays` plus future `windowDays` when `includeFuture`. */
function inWindow(
  iso: string,
  windowDays: number | null,
  nowMs: number,
  includeFuture = false,
): boolean {
  const t = new Date(iso).getTime();
  if (windowDays === null) return includeFuture || t <= nowMs;

  const span = windowDays * MS_PER_DAY;
  const pastStart = nowMs - span;
  if (t >= pastStart && t <= nowMs) return true;
  if (includeFuture && t > nowMs && t <= nowMs + span) return true;
  return false;
}

function emptySignals(): ClosenessSignalCounts {
  return { comms: 0, notes: 0, upcoming: 0, attended: 0, commitments: 0 };
}

/**
 * Rank contacts by closeness using platform comms, calendar events the
 * contact is attending (planned / attended), context notes, and commitments.
 */
export function innerCircleCloseness(input: {
  contacts: InnerCircleContactInput[];
  platformComms: PlatformCommsTouchpoint[];
  events: Event[];
  /** Interactions — only `note` kinds are counted. */
  interactions: Interaction[];
  openThreads: OpenThread[];
  /** relationship id → contact id */
  contactIdByRelationshipId: Record<string, string>;
  windowDays?: number | null;
  now?: Date;
  limit?: number;
}): InnerCircleRankings {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const windowDays = input.windowDays ?? null;
  const limit = input.limit ?? 12;

  const knownContactIds = new Set(input.contacts.map((c) => c.contactId));

  const scores = new Map<
    string,
    {
      score: number;
      signals: ClosenessSignalCounts;
      relationshipId: string;
      name: string;
    }
  >();

  for (const c of input.contacts) {
    scores.set(c.contactId, {
      score: 0,
      signals: emptySignals(),
      relationshipId: c.relationshipId,
      name: c.name,
    });
  }

  const bump = (
    contactId: string,
    key: keyof ClosenessSignalCounts,
    points: number,
  ) => {
    if (!knownContactIds.has(contactId)) return;
    const row = scores.get(contactId);
    if (!row) return;
    row.score += points;
    row.signals[key] += 1;
  };

  for (const msg of input.platformComms) {
    if (!inWindow(msg.sentAt, windowDays, nowMs)) continue;
    bump(msg.contactId, "comms", CLOSENESS_WEIGHTS.comms);
  }

  for (const event of input.events) {
    const isUpcoming = event.status === "planned";
    if (!inWindow(event.start, windowDays, nowMs, isUpcoming)) continue;

    let key: keyof ClosenessSignalCounts | null = null;
    let points = 0;

    if (isUpcoming) {
      key = "upcoming";
      points = CLOSENESS_WEIGHTS.upcoming;
    } else if (event.status === "attended") {
      key = "attended";
      points = CLOSENESS_WEIGHTS.attended;
    }

    if (!key) continue;

    for (const attendee of event.attendees) {
      bump(attendee.id, key, points);
    }
  }

  for (const i of input.interactions) {
    if (!isNoteKind(i.kind)) continue;
    if (!inWindow(i.time, windowDays, nowMs)) continue;
    for (const c of i.contacts) {
      bump(c.id, "notes", CLOSENESS_WEIGHTS.note);
    }
  }

  for (const thread of input.openThreads) {
    if (!inWindow(thread.createdAt, windowDays, nowMs)) continue;
    for (const relId of thread.relationshipIds) {
      const contactId = input.contactIdByRelationshipId[relId];
      if (!contactId) continue;
      bump(contactId, "commitments", CLOSENESS_WEIGHTS.commitment);
    }
  }

  const ranked = [...scores.entries()]
    .filter(([, row]) => row.score > 0)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit);

  const topScore = ranked[0]?.[1].score ?? 0;

  return {
    windowDays,
    contacts: ranked.map(([contactId, row]) => ({
      contactId,
      relationshipId: row.relationshipId,
      name: row.name,
      score: Math.round(row.score * 10) / 10,
      signals: { ...row.signals },
      relativeCloseness:
        topScore === 0
          ? 0
          : Math.round((row.score / topScore) * 100),
    })),
  };
}
