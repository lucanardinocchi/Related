import type { Interaction } from "../interactions/InteractionsClient";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DailyCountBucket {
  /** UTC date (YYYY-MM-DD). */
  date: string;
  count: number;
}

export type RelationshipAgeBand = "new" | "growing" | "established" | "longTerm";

export interface RelationshipAgeEngagementBucket {
  band: RelationshipAgeBand;
  /** Mean occurred-interaction count among relationships in this tenure band; null when empty. */
  averageInteractions: number | null;
  relationshipCount: number;
}

export interface TopContactsAverage {
  windowDays: number;
  /** Mean interaction count among the top N contacts; null when no contacts. */
  average: number | null;
  topN: number;
}

function utcStartOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function ymdUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayKeyFor(iso: string): string {
  return ymdUTC(utcStartOfDay(new Date(iso)));
}

function walkDays(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cursor = utcStartOfDay(from);
  const end = utcStartOfDay(to);
  while (cursor.getTime() <= end.getTime()) {
    keys.push(ymdUTC(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function relationshipAgeBand(
  relationshipCreatedAt: string,
  at: Date,
): RelationshipAgeBand {
  const ageDays = Math.floor(
    (at.getTime() - new Date(relationshipCreatedAt).getTime()) / MS_PER_DAY,
  );
  if (ageDays < 30) return "new";
  if (ageDays < 180) return "growing";
  if (ageDays < 365) return "established";
  return "longTerm";
}

const AGE_BANDS: RelationshipAgeBand[] = [
  "new",
  "growing",
  "established",
  "longTerm",
];

/**
 * New contacts added per day (by `createdAt`). One bar per day in [from, to].
 */
export function peopleAddedPerDay(input: {
  createdAts: string[];
  from: string;
  to: string;
}): DailyCountBucket[] {
  const counts = new Map<string, number>();
  for (const iso of input.createdAts) {
    const key = dayKeyFor(iso);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const days = walkDays(new Date(input.from), new Date(input.to));
  return days.map((date) => ({
    date,
    count: counts.get(date) ?? 0,
  }));
}

/**
 * New groups added per day (by `createdAt`).
 */
export function groupsAddedPerDay(input: {
  createdAts: string[];
  from: string;
  to: string;
}): DailyCountBucket[] {
  return peopleAddedPerDay(input);
}

/**
 * Average occurred-interaction count per relationship, grouped by tenure at
 * `to`. Each contact with a known relationship `createdAt` contributes one
 * relationship; interactions in [from, to] are counted (zero when none).
 */
export function averageInteractionsByRelationshipAge(input: {
  interactions: Interaction[];
  /** contact id → relationship `createdAt` */
  relationshipCreatedAtByContactId: Record<string, string>;
  from: string;
  to: string;
}): RelationshipAgeEngagementBucket[] {
  const fromTime = new Date(input.from).getTime();
  const toTime = new Date(input.to).getTime();
  const at = new Date(input.to);

  const interactionCounts = new Map<string, number>();
  for (const i of input.interactions) {
    if (i.status !== "occurred") continue;
    const t = new Date(i.time).getTime();
    if (t < fromTime || t > toTime) continue;
    for (const c of i.contacts) {
      interactionCounts.set(c.id, (interactionCounts.get(c.id) ?? 0) + 1);
    }
  }

  const perBand = new Map<RelationshipAgeBand, number[]>();
  for (const band of AGE_BANDS) {
    perBand.set(band, []);
  }

  for (const [contactId, relCreated] of Object.entries(
    input.relationshipCreatedAtByContactId,
  )) {
    const band = relationshipAgeBand(relCreated, at);
    const count = interactionCounts.get(contactId) ?? 0;
    perBand.get(band)!.push(count);
  }

  return AGE_BANDS.map((band) => {
    const counts = perBand.get(band)!;
    if (counts.length === 0) {
      return { band, averageInteractions: null, relationshipCount: 0 };
    }
    const sum = counts.reduce((a, b) => a + b, 0);
    return {
      band,
      averageInteractions: Math.round((sum / counts.length) * 10) / 10,
      relationshipCount: counts.length,
    };
  });
}

/**
 * Average occurred-interaction count among the top `topN` most-contacted
 * people in the rolling window ending at `now`.
 */
export function averageInteractionsAmongTopContacts(input: {
  interactions: Interaction[];
  windowDays: number;
  topN?: number;
  now?: Date;
}): TopContactsAverage {
  const now = input.now ?? new Date();
  const topN = input.topN ?? 15;
  const cutoff = now.getTime() - input.windowDays * MS_PER_DAY;

  const perContact = new Map<string, number>();
  for (const i of input.interactions) {
    if (i.status !== "occurred") continue;
    const t = new Date(i.time).getTime();
    if (t < cutoff || t > now.getTime()) continue;
    for (const c of i.contacts) {
      perContact.set(c.id, (perContact.get(c.id) ?? 0) + 1);
    }
  }

  const counts = [...perContact.values()].sort((a, b) => b - a);
  const top = counts.slice(0, topN);
  if (top.length === 0) {
    return { windowDays: input.windowDays, average: null, topN };
  }
  const sum = top.reduce((a, b) => a + b, 0);
  return {
    windowDays: input.windowDays,
    average: Math.round((sum / top.length) * 10) / 10,
    topN,
  };
}
