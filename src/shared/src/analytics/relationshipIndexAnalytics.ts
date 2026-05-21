import type { Interaction } from "../interactions/InteractionsClient";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface WeeklyCountBucket {
  /** UTC date (YYYY-MM-DD) for Monday of the week. */
  weekStart: string;
  count: number;
}

export type RelationshipAgeBand = "new" | "growing" | "established" | "longTerm";

export interface WeeklyInteractionsByAgeBucket {
  weekStart: string;
  new: number;
  growing: number;
  established: number;
  longTerm: number;
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

/** Monday-based week start (UTC). */
function utcStartOfWeek(d: Date): Date {
  const x = utcStartOfDay(d);
  const dow = x.getUTCDay();
  const back = (dow + 6) % 7;
  x.setUTCDate(x.getUTCDate() - back);
  return x;
}

function ymdUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekKeyFor(iso: string): string {
  return ymdUTC(utcStartOfWeek(new Date(iso)));
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

function walkWeeks(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cursor = utcStartOfWeek(from);
  const end = utcStartOfWeek(to);
  while (cursor.getTime() <= end.getTime()) {
    keys.push(ymdUTC(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return keys;
}

/**
 * New contacts added per week (by `createdAt`). One bar per week in [from, to].
 */
export function peopleAddedPerWeek(input: {
  createdAts: string[];
  from: string;
  to: string;
}): WeeklyCountBucket[] {
  const counts = new Map<string, number>();
  for (const iso of input.createdAts) {
    const key = weekKeyFor(iso);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const weeks = walkWeeks(
    utcStartOfWeek(new Date(input.from)),
    utcStartOfWeek(new Date(input.to)),
  );
  return weeks.map((weekStart) => ({
    weekStart,
    count: counts.get(weekStart) ?? 0,
  }));
}

/**
 * New groups added per week (by `createdAt`).
 */
export function groupsAddedPerWeek(input: {
  createdAts: string[];
  from: string;
  to: string;
}): WeeklyCountBucket[] {
  return peopleAddedPerWeek(input);
}

/**
 * Occurred interactions per calendar week, split by relationship tenure at
 * interaction time. Each contact on an interaction contributes one count to
 * their relationship's age band for that week.
 */
export function interactionsPerWeekByRelationshipAge(input: {
  interactions: Interaction[];
  /** contact id → relationship `createdAt` */
  relationshipCreatedAtByContactId: Record<string, string>;
  from: string;
  to: string;
}): WeeklyInteractionsByAgeBucket[] {
  const counts = new Map<
    string,
    { new: number; growing: number; established: number; longTerm: number }
  >();

  const bump = (weekStart: string, band: RelationshipAgeBand) => {
    const prev = counts.get(weekStart) ?? {
      new: 0,
      growing: 0,
      established: 0,
      longTerm: 0,
    };
    prev[band] += 1;
    counts.set(weekStart, prev);
  };

  for (const i of input.interactions) {
    if (i.status !== "occurred") continue;
    const at = new Date(i.time);
    const weekStart = weekKeyFor(i.time);
    for (const c of i.contacts) {
      const relCreated = input.relationshipCreatedAtByContactId[c.id];
      if (!relCreated) continue;
      bump(weekStart, relationshipAgeBand(relCreated, at));
    }
  }

  const weeks = walkWeeks(
    utcStartOfWeek(new Date(input.from)),
    utcStartOfWeek(new Date(input.to)),
  );
  return weeks.map((weekStart) => {
    const c = counts.get(weekStart);
    return {
      weekStart,
      new: c?.new ?? 0,
      growing: c?.growing ?? 0,
      established: c?.established ?? 0,
      longTerm: c?.longTerm ?? 0,
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
