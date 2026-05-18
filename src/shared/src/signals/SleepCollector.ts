import type { SupabaseClient } from "@supabase/supabase-js";
import type { RawSleepRecord } from "./sleepSummary";

/**
 * Slice 12 sleep collector. Same shape as CalendarCollector: an injected
 * fetcher (HealthKit on iOS) returns the User's last-3-days records;
 * the collector upserts them and garbage-collects any rows whose
 * record_id is no longer in the returned set.
 */

export type SleepFetcher = (asOf: Date) => Promise<RawSleepRecord[]>;

export interface SleepCollectorOptions {
  supabase: SupabaseClient;
  fetcher: SleepFetcher;
}

export class SleepCollector {
  private readonly supabase: SupabaseClient;
  private readonly fetcher: SleepFetcher;

  constructor(opts: SleepCollectorOptions) {
    this.supabase = opts.supabase;
    this.fetcher = opts.fetcher;
  }

  async runFor(ownerId: string, asOf: Date): Promise<void> {
    const records = await this.fetcher(asOf);

    if (records.length > 0) {
      const rows = records.map((r) => ({
        owner_id: ownerId,
        record_id: r.id,
        started_at: r.startedAt,
        ended_at: r.endedAt,
        duration_minutes: r.durationMinutes,
        quality: r.quality,
      }));
      const { error: upErr } = await this.supabase
        .from("inferred_signal_sleep")
        .upsert(rows, { onConflict: "owner_id,record_id" });
      if (upErr) throw upErr;
    }

    const keepList = records.map((r) => r.id).join(",");
    const { error: delErr } = await this.supabase
      .from("inferred_signal_sleep")
      .delete()
      .eq("owner_id", ownerId)
      .not("record_id", "in", `(${keepList})`);
    if (delErr) throw delErr;
  }
}
