import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CalendarCollector,
  type CalendarFetcher,
} from "./CalendarCollector";
import type { RawCalendarEvent } from "./calendarDensity";
import { FakeCalendarFetcher } from "./FakeCalendarFetcher";

/**
 * The one-line entry point for "pull this User's calendar and persist
 * the 7-day forward window". Designed to be invoked from:
 *
 *   - the pg_cron-driven `sync-calendar` Edge Function (daily 10 AM)
 *   - a future "Sync now" button in the You/settings screen
 *   - tests and demo scripts (paired with FakeCalendarFetcher)
 *
 * Idempotent: re-running for the same User on the same day upserts on
 * `(owner_id, event_id)` and garbage-collects any rows no longer
 * returned by the fetcher — see CalendarCollector for the replacement
 * strategy.
 *
 * Returns a small summary so the caller can log / surface progress:
 *
 *   - eventsWritten — number of events the fetcher returned
 *   - windowEnd     — ISO of the 7-day forward boundary (informational)
 *
 * NOTE: This driver is per-User. Multi-tenant orchestration (iterate
 * over every authenticated User) is the caller's responsibility — the
 * cron-side function does it, individual UI actions don't.
 */

export type CalendarFetcherLike =
  | CalendarFetcher
  | FakeCalendarFetcher
  | { fetch: (asOf: Date) => Promise<RawCalendarEvent[]> };

export interface RunDailyCalendarCollectionOptions {
  supabase: SupabaseClient;
  fetcher: CalendarFetcherLike;
  ownerId: string;
  asOf: Date;
}

export interface CalendarCollectionSummary {
  eventsWritten: number;
  windowEnd: string;
}

const WINDOW_DAYS = 7;

function toFetcher(fetcher: CalendarFetcherLike): CalendarFetcher {
  if (typeof fetcher === "function") return fetcher;
  if (fetcher instanceof FakeCalendarFetcher) return fetcher.asCalendarFetcher();
  return (asOf: Date) => fetcher.fetch(asOf);
}

export async function runDailyCalendarCollection(
  opts: RunDailyCalendarCollectionOptions,
): Promise<CalendarCollectionSummary> {
  const fetcher = toFetcher(opts.fetcher);

  // We invoke the fetcher once here to learn how many events were
  // pulled (so the summary is meaningful) and pass the same data to
  // the collector via a thunk so we don't double-fetch.
  const events = await fetcher(opts.asOf);
  const cachedFetcher: CalendarFetcher = async () => events;

  const collector = new CalendarCollector({
    supabase: opts.supabase,
    fetcher: cachedFetcher,
  });
  await collector.runFor(opts.ownerId, opts.asOf);

  const windowEnd = new Date(opts.asOf);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + WINDOW_DAYS);

  return {
    eventsWritten: events.length,
    windowEnd: windowEnd.toISOString(),
  };
}
