// Snapshot fetchers for context preload (contextLoader).
// User Context tables are loaded via @related/shared loadUserContextCore.

import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import { SNAPSHOT_CAPS } from "../../_shared/conversational/snapshot.ts";
import {
  INTERACTION_SELECT_SNAPSHOT,
  OPEN_THREAD_SELECT_SNAPSHOT,
} from "./selects.ts";

export function fetchOpenThreadsSnapshot(
  supabase: SupabaseClient,
  cap = SNAPSHOT_CAPS.openThreads,
) {
  return supabase
    .from("open_threads")
    .select(OPEN_THREAD_SELECT_SNAPSHOT, { count: "exact" })
    .is("closed_at", null)
    .order("created_at", { ascending: false })
    .limit(cap);
}

export function fetchInteractionsSnapshot(
  supabase: SupabaseClient,
  sinceIso: string,
  cap = SNAPSHOT_CAPS.interactions,
) {
  return supabase
    .from("interactions")
    .select(INTERACTION_SELECT_SNAPSHOT, { count: "exact" })
    .gte("time", sinceIso)
    .order("time", { ascending: false })
    .limit(cap);
}
