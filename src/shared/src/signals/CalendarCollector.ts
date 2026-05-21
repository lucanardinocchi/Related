import type { SupabaseClient } from "@supabase/supabase-js";
import type { RawCalendarEvent } from "./calendarDensity";
import { toSignalRow } from "./calendarSyncDualWrite";

/**
 * Slice 11 calendar collector. The OAuth-bound fetcher (Google Calendar
 * or EventKit) is injected so the collector stays testable and so a
 * real fetcher can be swapped in once OAuth lands. The collector's job
 * is the persistence side: replace the User's 7-day forward window.
 *
 * Replacement strategy:
 *   1) Upsert every event the fetcher returned (keyed on
 *      (owner_id, event_id)).
 *   2) Delete any of the User's rows whose event_id is NOT in the
 *      returned set — so a vanished event (cancelled, moved out of
 *      window) gets garbage-collected on the next run.
 */

export type CalendarFetcher = (asOf: Date) => Promise<RawCalendarEvent[]>;

export interface CalendarCollectorOptions {
  supabase: SupabaseClient;
  fetcher: CalendarFetcher;
}

export class CalendarCollector {
  private readonly supabase: SupabaseClient;
  private readonly fetcher: CalendarFetcher;

  constructor(opts: CalendarCollectorOptions) {
    this.supabase = opts.supabase;
    this.fetcher = opts.fetcher;
  }

  async runFor(ownerId: string, asOf: Date): Promise<void> {
    const events = await this.fetcher(asOf);

    if (events.length > 0) {
      const rows = events.map((e) => toSignalRow(ownerId, e));
      const { error: upErr } = await this.supabase
        .from("inferred_signal_calendar")
        .upsert(rows, { onConflict: "owner_id,event_id" });
      if (upErr) throw upErr;
    }

    // Garbage-collect events no longer in the window. When the fetcher
    // returned nothing, the keep-list is empty and every row for this
    // owner is deleted — matches the "calendar cleared" expectation.
    const keepList = events.map((e) => e.id).join(",");
    const { error: delErr } = await this.supabase
      .from("inferred_signal_calendar")
      .delete()
      .eq("owner_id", ownerId)
      .not("event_id", "in", `(${keepList})`);
    if (delErr) throw delErr;
  }
}
