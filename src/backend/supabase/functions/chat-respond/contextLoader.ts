// Loads a compact ConversationContextSnapshot for the User in one shot.
// Called once per chat-respond invocation. All queries use the
// User-scoped SupabaseClient; RLS enforces owner-only.
//
// User Context (goals, situational, transient, relationships, groups) is
// assembled via @related/shared — see userContextCore.ts for caps and parity.
//
// Conversation-only caps:
//   - open_threads: 50 (open only)
//   - recent_interactions: 30-day window, 100 rows
//
// When the underlying total exceeds a cap, the snapshot includes a
// `*Total` count so the prompt can hint the model to call the
// corresponding tool for the remainder.

import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import {
  loadUserContextCore,
} from "../../../../shared/src/agent/userContextCore.ts";
import {
  projectForConversationalTurn,
} from "../../../../shared/src/agent/userContextProjections.ts";
import {
  fetchInteractionsSnapshot,
  fetchOpenThreadsSnapshot,
  mapInteractionsToSummaries,
  mapOpenThreadsToSummaries,
  MS_PER_DAY,
  SNAPSHOT_CAPS,
  type RawInteractionRow,
  type RawOpenThreadRow,
} from "./queries.ts";
import type { ConversationContextSnapshot } from "./types.ts";

export async function loadConversationContext(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<ConversationContextSnapshot> {
  const sinceIso = new Date(
    now.getTime() - SNAPSHOT_CAPS.interactionsWindowDays * MS_PER_DAY,
  ).toISOString();

  const [core, openThreadsRes, interactionsRes] = await Promise.all([
    loadUserContextCore(supabase, {
      asOf: now,
      transientIntent: { kind: "all_non_expired" },
      groupsOrder: "name_asc",
    }),
    fetchOpenThreadsSnapshot(supabase),
    fetchInteractionsSnapshot(supabase, sinceIso),
  ]);

  const projected = projectForConversationalTurn(core);
  const openThreads = mapOpenThreadsToSummaries(
    (openThreadsRes.data ?? []) as RawOpenThreadRow[],
    now,
  );
  const recentInteractions = mapInteractionsToSummaries(
    (interactionsRes.data ?? []) as RawInteractionRow[],
  );

  return {
    asOf: core.asOf,
    relationships: projected.relationships,
    relationshipsTotal: projected.relationshipsTotal,
    groups: projected.groups,
    userContext: projected.userContext,
    openThreads,
    openThreadsTotal: openThreadsRes.count ?? openThreads.length,
    recentInteractions,
    recentInteractionsTotal: interactionsRes.count ?? recentInteractions.length,
  };
}
