import type { SupabaseClient } from "@supabase/supabase-js";
import { SleepCollector, type SleepFetcher } from "./SleepCollector";

/**
 * Driver wrapping `SleepCollector` for the daily ingestion loop.
 *
 * Same shape as we'll want for the calendar one. Three callers:
 *
 *   1. **pg_cron** — invokes the `sync-sleep` Edge Function once a day
 *      at 10 AM (UTC v1; per-User-local TZ deferred).
 *   2. **Manual UI** — a "refresh now" affordance for the User to
 *      force a pull (e.g. after granting HealthKit permission).
 *   3. **Tests** — see this file's spec.
 *
 * Idempotent: keyed on `(owner_id, record_id)` in the DB. Calling
 * twice with the same fetcher output yields the same final rows.
 *
 * The 3-day window mirrors `sleepSummary.ts`'s `WINDOW_DAYS = 3`.
 */

const WINDOW_DAYS = 3;

export interface RunDailySleepCollectionInput {
  supabase: SupabaseClient;
  fetcher: SleepFetcher;
  ownerId: string;
  asOf: Date;
}

export interface RunDailySleepCollectionResult {
  recordsWritten: number;
  windowStart: string;
}

export async function runDailySleepCollection(
  input: RunDailySleepCollectionInput,
): Promise<RunDailySleepCollectionResult> {
  const { supabase, fetcher, ownerId, asOf } = input;

  // Re-fetch so we can report `recordsWritten` without poking into
  // the collector's internals. The fetcher is expected to be cheap
  // (deterministic stub today; HealthKit batch in v2).
  const records = await fetcher(asOf);

  const collector = new SleepCollector({ supabase, fetcher: async () => records });
  await collector.runFor(ownerId, asOf);

  const windowStart = new Date(asOf);
  windowStart.setUTCDate(windowStart.getUTCDate() - WINDOW_DAYS);

  return {
    recordsWritten: records.length,
    windowStart: windowStart.toISOString(),
  };
}
