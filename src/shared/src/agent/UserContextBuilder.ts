import type { SupabaseClient } from "@supabase/supabase-js";
import {
  summariseCalendarDensity,
  type CalendarDensitySignal,
  type RawCalendarEvent,
} from "../signals/calendarDensity";
import {
  summariseSleep,
  type SleepSignal,
  type RawSleepRecord,
} from "../signals/sleepSummary";
import {
  loadUserContextCore,
  type CharacterValuesAlignmentEntry,
  type OperatorStrengthEntry,
  type TransientIntentLoadMode,
  type UserContextSnapshot,
} from "./userContextCore";
import { projectForAmbientPass } from "./userContextProjections";

/**
 * User Context Builder — ADR-0002. Per Pass, returns a snapshot of the four
 * dynamically-weighted flavours that compose User Context, plus user-wide
 * relationship and group summaries for cross-relationship reasoning.
 *
 * Overlapping tables are loaded via `loadUserContextCore` and projected with
 * `projectForAmbientPass`. See `userContextCore.ts` for field parity vs
 * Conversational Intelligence.
 */

export type {
  CalendarDensitySignal,
  SleepSignal,
  RawCalendarEvent,
  RawSleepRecord,
  GoalEntry,
  SituationalStateSnapshot,
  OperatorStrengthEntry,
  CharacterValuesAlignmentEntry,
  UserContextSnapshot,
  UserContextGroupSummary as GroupSummary,
  UserContextRelationshipSummary as RelationshipSummary,
} from "./userContextCore";

export interface UserContextBuilderOptions {
  supabase?: SupabaseClient;
}

interface OperatorStrengthRow {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface CharacterValuesAlignmentRow {
  id: string;
  character_id: string;
  aligned: boolean;
  rank_position: number | null;
  character_name: string | null;
  character_source: string | null;
  character_values: string[] | null;
  created_at: string;
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
    live?: {
      mode?: "baseline" | "triggered" | "engaged";
      sessionId?: string;
      /** Exclude this relationship from otherRelationships summary. */
      excludeRelationshipId?: string;
    },
  ): Promise<UserContextSnapshot> {
    if (!this.supabase) {
      return projectForAmbientPass(
        {
          asOf: asOf.toISOString(),
          goalsAndValues: [],
          situationalState: null,
          transientIntent: [],
          groups: [],
          relationships: [],
          relationshipsTotal: 0,
        },
        {
          userId,
          operatorStrengths: [],
          inferredSignals: {
            calendarDensity: null,
            sleep: null,
            calendarEvents: [],
            sleepRecords: [],
          },
          characterValuesAlignment: [],
        },
      );
    }

    const transientIntent = resolveTransientIntentMode(live);
    const [core, operatorStrengths, calendar, sleep, characterValuesAlignment] =
      await Promise.all([
        loadUserContextCore(this.supabase, {
          asOf,
          transientIntent,
          excludeRelationshipId: live?.excludeRelationshipId,
          groupsOrder: "created_at_desc",
        }),
        this.loadOperatorStrengths(),
        this.loadCalendar(asOf),
        this.loadSleep(asOf),
        this.loadCharacterValuesAlignment(),
      ]);

    return projectForAmbientPass(core, {
      userId,
      operatorStrengths,
      inferredSignals: {
        calendarDensity: calendar.summary,
        sleep: sleep.summary,
        calendarEvents: calendar.events,
        sleepRecords: sleep.records,
      },
      characterValuesAlignment,
    });
  }

  private async loadOperatorStrengths(): Promise<OperatorStrengthEntry[]> {
    if (!this.supabase) return [];
    const { data, error } = await this.supabase
      .from("operator_strengths")
      .select("id, content, created_at, updated_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as OperatorStrengthRow[]).map((r) => ({
      id: r.id,
      content: r.content,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  private async loadCalendar(asOf: Date): Promise<{
    events: RawCalendarEvent[];
    summary: CalendarDensitySignal | null;
  }> {
    if (!this.supabase) return { events: [], summary: null };
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
    const events: RawCalendarEvent[] = rows.map((r) => ({
      id: r.event_id,
      title: r.title ?? undefined,
      start: r.start,
      end: r.end,
      isAllDay: r.is_all_day,
    }));
    return {
      events,
      summary: events.length === 0 ? null : summariseCalendarDensity(events, asOf),
    };
  }

  private async loadSleep(asOf: Date): Promise<{
    records: RawSleepRecord[];
    summary: SleepSignal | null;
  }> {
    if (!this.supabase) return { records: [], summary: null };
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
    const records: RawSleepRecord[] = rows.map((r) => ({
      id: r.record_id,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      durationMinutes: r.duration_minutes,
      quality: r.quality,
    }));
    return {
      records,
      summary: records.length === 0 ? null : summariseSleep(records, asOf),
    };
  }

  private async loadCharacterValuesAlignment(): Promise<
    CharacterValuesAlignmentEntry[]
  > {
    if (!this.supabase) return [];
    const { data, error } = await this.supabase
      .from("user_character_values_alignment")
      .select(
        "id, character_id, aligned, rank_position, character_name, character_source, character_values, created_at, updated_at",
      )
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as CharacterValuesAlignmentRow[]).map((r) => ({
      id: r.id,
      characterId: r.character_id,
      aligned: r.aligned,
      rankPosition: r.rank_position,
      characterName: r.character_name,
      characterSource: r.character_source,
      characterValues: r.character_values,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }
}

function resolveTransientIntentMode(live?: {
  mode?: "baseline" | "triggered" | "engaged";
  sessionId?: string;
}): TransientIntentLoadMode {
  if (live?.mode === "engaged" && live.sessionId) {
    return { kind: "session", sessionId: live.sessionId };
  }
  return { kind: "none" };
}
