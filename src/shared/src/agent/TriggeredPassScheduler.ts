import type { SupabaseClient } from "@supabase/supabase-js";
import type { TriggeredPassScheduler } from "./Executor";

/**
 * Default Triggered Pass dispatcher — enqueues via the Supabase RPC that
 * wraps `enqueue_pass` on `scheduled_passes`. Debounced server-side so
 * rapid Executor calls (or overlap with DB triggers) coalesce to one Pass.
 */
export function createDefaultTriggeredPassScheduler(
  supabase: SupabaseClient,
): TriggeredPassScheduler {
  return async ({ relationshipId, reason }) => {
    const { error } = await supabase.rpc("schedule_triggered_pass", {
      p_relationship_id: relationshipId,
      p_reason: reason,
    });
    if (error) throw error;
  };
}
