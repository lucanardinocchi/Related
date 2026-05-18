import type { SupabaseClient } from "@supabase/supabase-js";
import {
  summariseCalendarDensity,
  type CalendarDensitySignal as CalendarDensity,
  type RawCalendarEvent,
} from "../signals/calendarDensity";
import {
  summariseSleep,
  type SleepSignal as SleepSignalShape,
  type RawSleepRecord,
} from "../signals/sleepSummary";

/**
 * User Context Builder — ADR-0002. Per Pass, returns a snapshot of the four
 * dynamically-weighted flavours that compose User Context.
 *
 *   Slice 7  — interface + empty snapshot.
 *   Slice 10 — Goals & Values + Situational State populated when a
 *              SupabaseClient is wired.
 *   Slice 11 — Inferred Signals: Calendar density.
 *   Slice 12 — Inferred Signals: Sleep.
 *   Slice 14 — Transient Intent capture.
 */

// Re-exported from ../signals so callers have a stable path.
export type CalendarDensitySignal = CalendarDensity;

// Re-exported from ../signals so callers have a stable path.
export type SleepSignal = SleepSignalShape;

export interface UserContextSnapshot {
  userId: string;
  asOf: string;
  transientIntent: string[];
  situationalState: string[];
  goalsAndValues: string[];
  inferredSignals: {
    calendarDensity: CalendarDensitySignal | null;
    sleep: SleepSignal | null;
  };
}

export interface UserContextBuilderOptions {
  /** Wire this to read Goals & Values and Situational State. Without it the builder returns the empty snapshot (Slice 7 behaviour). */
  supabase?: SupabaseClient;
}

interface GoalRow {
  content: string;
}

interface SituationalStateRow {
  content: string;
  updated_at: string;
}

export class UserContextBuilder {
  private readonly supabase?: SupabaseClient;

  constructor(opts: UserContextBuilderOptions = {}) {
    this.supabase = opts.supabase;
  }

  async buildUserContext(
    userId: string,
    asOf: Date,
  ): Promise<UserContextSnapshot> {
    const goals = await this.loadGoals();
    const situational = await this.loadSituationalState();
    const calendarDensity = await this.loadCalendarDensity(asOf);
    const sleep = await this.loadSleep(asOf);

    return {
      userId,
      asOf: asOf.toISOString(),
      transientIntent: [],
      situationalState: situational,
      goalsAndValues: goals,
      inferredSignals: { calendarDensity, sleep },
    };
  }

  private async loadGoals(): Promise<string[]> {
    if (!this.supabase) return [];
    const { data, error } = await this.supabase
      .from("goals_and_values")
      .select("content")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as GoalRow[]).map((r) => r.content);
  }

  private async loadSituationalState(): Promise<string[]> {
    if (!this.supabase) return [];
    const { data, error } = await this.supabase
      .from("situational_state")
      .select("content, updated_at")
      .maybeSingle();
    if (error) throw error;
    return data ? [(data as SituationalStateRow).content] : [];
  }

  private async loadCalendarDensity(asOf: Date): Promise<CalendarDensity | null> {
    if (!this.supabase) return null;
    const windowEnd = new Date(asOf);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 7);
    const { data, error } = await this.supabase
      .from("inferred_signal_calendar")
      .select("event_id, title, start, end, is_all_day")
      .gte("start", asOf.toISOString())
      .lt("start", windowEnd.toISOString());
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      event_id: string;
      title: string | null;
      start: string;
      end: string;
      is_all_day: boolean;
    }>;
    // Graceful degradation: no rows ⇒ no signal (calendar unavailable).
    if (rows.length === 0) return null;
    const events: RawCalendarEvent[] = rows.map((r) => ({
      id: r.event_id,
      title: r.title ?? undefined,
      start: r.start,
      end: r.end,
      isAllDay: r.is_all_day,
    }));
    return summariseCalendarDensity(events, asOf);
  }

  private async loadSleep(asOf: Date): Promise<SleepSignalShape | null> {
    if (!this.supabase) return null;
    const cutoff = new Date(asOf);
    cutoff.setUTCDate(cutoff.getUTCDate() - 3);
    const { data, error } = await this.supabase
      .from("inferred_signal_sleep")
      .select("record_id, started_at, ended_at, duration_minutes, quality")
      .gte("started_at", cutoff.toISOString())
      .lte("started_at", asOf.toISOString());
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      record_id: string;
      started_at: string;
      ended_at: string;
      duration_minutes: number;
      quality: string | null;
    }>;
    if (rows.length === 0) return null;
    const records: RawSleepRecord[] = rows.map((r) => ({
      id: r.record_id,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      durationMinutes: r.duration_minutes,
      quality: r.quality,
    }));
    return summariseSleep(records, asOf);
  }
}
