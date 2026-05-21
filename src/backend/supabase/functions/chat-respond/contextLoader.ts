// Loads a compact ConversationContextSnapshot for the User in one shot.
// Called once per chat-respond invocation. All queries use the
// User-scoped SupabaseClient; RLS enforces owner-only.
//
// Caps:
//   - relationships: 200
//   - groups: 50
//   - open_threads: 50 (open only)
//   - recent_interactions: 30-day window, 100 rows
//   - transient_intent: 20 rows (non-expired)
//
// When the underlying total exceeds a cap, the snapshot includes a
// `*Total` count so the prompt can hint the model to call the
// corresponding tool for the remainder.

import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import {
  fetchGoalsSnapshot,
  fetchGroupsSnapshot,
  fetchInteractionsSnapshot,
  fetchOpenThreadsSnapshot,
  fetchRelationshipsSnapshot,
  fetchSituationalStateSnapshot,
  fetchTransientIntentSnapshot,
  mapGroupsToSummaries,
  mapInteractionsToSummaries,
  mapOpenThreadsToSummaries,
  mapRelationshipsToSummaries,
  mapTransientIntentToSummaries,
  MS_PER_DAY,
  SNAPSHOT_CAPS,
  type RawGroupRow,
  type RawInteractionRow,
  type RawOpenThreadRow,
  type RawRelationshipRow,
  type RawTransientIntentRow,
} from "./queries.ts";
import type { ConversationContextSnapshot } from "./types.ts";

export async function loadConversationContext(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<ConversationContextSnapshot> {
  const sinceIso = new Date(
    now.getTime() - SNAPSHOT_CAPS.interactionsWindowDays * MS_PER_DAY,
  ).toISOString();
  const nowIso = now.toISOString();

  const [
    relationshipsRes,
    groupsRes,
    openThreadsRes,
    interactionsRes,
    goalsRes,
    situationalRes,
    transientRes,
  ] = await Promise.all([
    fetchRelationshipsSnapshot(supabase),
    fetchGroupsSnapshot(supabase),
    fetchOpenThreadsSnapshot(supabase),
    fetchInteractionsSnapshot(supabase, sinceIso),
    fetchGoalsSnapshot(supabase),
    fetchSituationalStateSnapshot(supabase),
    fetchTransientIntentSnapshot(supabase, nowIso),
  ]);

  const relationships = mapRelationshipsToSummaries(
    (relationshipsRes.data ?? []) as RawRelationshipRow[],
  );
  const groups = mapGroupsToSummaries((groupsRes.data ?? []) as RawGroupRow[]);
  const openThreads = mapOpenThreadsToSummaries(
    (openThreadsRes.data ?? []) as RawOpenThreadRow[],
    now,
  );
  const recentInteractions = mapInteractionsToSummaries(
    (interactionsRes.data ?? []) as RawInteractionRow[],
  );
  const transientIntent = mapTransientIntentToSummaries(
    (transientRes.data ?? []) as RawTransientIntentRow[],
  );

  return {
    asOf: nowIso,
    relationships,
    relationshipsTotal: relationshipsRes.count ?? relationships.length,
    groups,
    userContext: {
      goalsAndValues: ((goalsRes.data ?? []) as Array<{ content: string }>).map(
        (r) => r.content,
      ),
      situationalState:
        (situationalRes.data as { content?: string } | null)?.content ?? null,
      recentTransientIntent: transientIntent,
    },
    openThreads,
    openThreadsTotal: openThreadsRes.count ?? openThreads.length,
    recentInteractions,
    recentInteractionsTotal: interactionsRes.count ?? recentInteractions.length,
  };
}
