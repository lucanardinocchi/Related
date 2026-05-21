import type { Interaction } from "../interactions/InteractionsClient";
import type { OpenThread } from "../open-threads/OpenThreadsClient";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Points per touchpoint type — tuned for comparable scale across signals. */
export const CLOSENESS_WEIGHTS = {
  interaction: 3,
  comms: 2,
  note: 2,
  commitment: 2,
} as const;

const COMMS_KINDS = new Set([
  "email",
  "sms",
  "imessage",
  "phone_call",
  "whatsapp",
  "instagram_dm",
  "x_dm",
  "tiktok_dm",
]);

export interface ClosenessSignalCounts {
  interactions: number;
  comms: number;
  notes: number;
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

function isCommsKind(kind: string): boolean {
  return COMMS_KINDS.has(kind);
}

function isOccurredInteraction(i: Interaction): boolean {
  return i.status === "occurred" || i.status === "attended";
}

function inWindow(iso: string, cutoff: number | null, now: number): boolean {
  const t = new Date(iso).getTime();
  if (t > now) return false;
  if (cutoff === null) return true;
  return t >= cutoff;
}

function emptySignals(): ClosenessSignalCounts {
  return { interactions: 0, comms: 0, notes: 0, commitments: 0 };
}

/**
 * Rank contacts by closeness using interactions (in-person), comms, free-form
 * notes, and commitments opened. Returns top `limit` contacts by score.
 */
export function innerCircleCloseness(input: {
  contacts: InnerCircleContactInput[];
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
  const cutoff =
    windowDays === null ? null : nowMs - windowDays * MS_PER_DAY;
  const limit = input.limit ?? 12;

  const scores = new Map<
    string,
    { score: number; signals: ClosenessSignalCounts; relationshipId: string; name: string }
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
    const row = scores.get(contactId);
    if (!row) return;
    row.score += points;
    row.signals[key] += 1;
  };

  for (const i of input.interactions) {
    if (!inWindow(i.time, cutoff, nowMs)) continue;

    let key: keyof ClosenessSignalCounts | null = null;
    let points = 0;

    if (isNoteKind(i.kind)) {
      key = "notes";
      points = CLOSENESS_WEIGHTS.note;
    } else if (isCommsKind(i.kind)) {
      key = "comms";
      points = CLOSENESS_WEIGHTS.comms;
    } else if (isOccurredInteraction(i)) {
      key = "interactions";
      points = CLOSENESS_WEIGHTS.interaction;
    }

    if (!key) continue;

    for (const c of i.contacts) {
      bump(c.id, key, points);
    }
  }

  for (const thread of input.openThreads) {
    if (!inWindow(thread.createdAt, cutoff, nowMs)) continue;
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
