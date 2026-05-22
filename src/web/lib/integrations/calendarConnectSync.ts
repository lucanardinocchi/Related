import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Backfill calendar history + register push subscriptions after connect.
 * Fire-and-forget — callers should not await unless they need the result.
 */
export function triggerCalendarConnectSync(
  supabase: SupabaseClient,
  ownerId: string,
): void {
  void supabase.functions.invoke("sync-calendar", {
    body: { ownerId, subscribe: true },
  });
}
