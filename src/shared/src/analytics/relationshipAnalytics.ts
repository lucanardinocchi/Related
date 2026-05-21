import type { Interaction } from "../interactions/InteractionsClient";
import type { OpenThread } from "../open-threads/OpenThreadsClient";

/**
 * Per-Relationship analytics surfaced on the web /relationships index and
 * detail pages. All functions are pure: they take already-fetched lists and
 * return numbers — IO lives in the clients. Deterministic across calls.
 */
export interface RelationshipAnalytics {
  totalInteractions: number;
  interactionsLast30Days: number;
  openCommitments: number;
  openThreads: number;
  /**
   * ISO timestamp of the most recent `occurred` Interaction, or null if
   * the Relationship has no logged history yet. Drives the "last seen"
   * column on the index.
   */
  lastInteractionAt: string | null;
  /**
   * Whole days since `lastInteractionAt`, computed against the caller-
   * provided `now`. Null when `lastInteractionAt` is null.
   */
  daysSinceLastInteraction: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isWithinLastNDays(iso: string, now: Date, days: number): boolean {
  const t = new Date(iso).getTime();
  const cutoff = now.getTime() - days * MS_PER_DAY;
  return t >= cutoff && t <= now.getTime();
}

export function relationshipAnalytics(input: {
  interactions: Interaction[];
  openThreads: OpenThread[];
  now?: Date;
}): RelationshipAnalytics {
  const now = input.now ?? new Date();

  // Only `occurred` Interactions count as history — `planned` is future,
  // `missed` is acknowledged-as-not-happened (cf. InteractionsClient).
  const occurred = input.interactions.filter((i) => i.status === "occurred");

  const last30 = occurred.filter((i) => isWithinLastNDays(i.time, now, 30));

  let last: Interaction | null = null;
  for (const i of occurred) {
    if (!last || new Date(i.time) > new Date(last.time)) {
      last = i;
    }
  }

  const lastInteractionAt = last?.time ?? null;
  const daysSinceLastInteraction = lastInteractionAt
    ? Math.floor(
        (now.getTime() - new Date(lastInteractionAt).getTime()) / MS_PER_DAY,
      )
    : null;

  const openCommitments = input.openThreads.filter(
    (t) => t.direction === "me_owes_them" && t.closedAt === null,
  ).length;

  const openCount = input.openThreads.filter((t) => t.closedAt === null).length;

  return {
    totalInteractions: occurred.length,
    interactionsLast30Days: last30.length,
    openCommitments,
    openThreads: openCount,
    lastInteractionAt,
    daysSinceLastInteraction,
  };
}
