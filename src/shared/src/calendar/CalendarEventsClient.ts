import {
  createClient,
  SupabaseClient,
} from "@supabase/supabase-js";

/**
 * Source of a CalendarEvent — currently only Google Calendar (per
 * inferred_signal_calendar). Future sources (Outlook, iCloud) would extend
 * the union without breaking the unified web /calendar timeline.
 */
export type CalendarEventSource = "google";

/**
 * A single external calendar event the agent has ingested as an Inferred
 * Signal (`inferred_signal_calendar`). Read-only from the web UI: editing
 * happens upstream in the User's external calendar; the daily `sync-calendar`
 * cron picks up changes. The /calendar page renders these alongside
 * Interactions, badged by source. See src/shared/CONTEXT.md → Calendar (UI).
 */
export interface CalendarEvent {
  id: string;
  externalEventId: string;
  source: CalendarEventSource;
  title: string | null;
  start: string;
  end: string;
  isAllDay: boolean;
  fetchedAt: string;
}

export interface CalendarEventsClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

interface CalendarEventRow {
  id: string;
  event_id: string;
  title: string | null;
  start: string;
  end: string;
  is_all_day: boolean;
  fetched_at: string;
}

function toCalendarEvent(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    externalEventId: row.event_id,
    // v1 only Google rows live in this table; if/when other sources land
    // they'll carry a source column and we'll read it here.
    source: "google",
    title: row.title,
    start: row.start,
    end: row.end,
    isAllDay: row.is_all_day,
    fetchedAt: row.fetched_at,
  };
}

// `end` is a Postgres reserved word and the column is quoted at the
// migration level (see 20260519000004_calendar_signal.sql). PostgREST
// accepts the unquoted column name in the select string and the JSON
// response key comes back as plain `end`.
const SELECT = "id, event_id, title, start, end, is_all_day, fetched_at";

/**
 * Read external Calendar events from `inferred_signal_calendar`. This is
 * the integration boundary for the web /calendar page's unified view —
 * external events render read-only alongside first-class Interactions, with
 * a source badge so the User can tell them apart. RLS scopes to owner.
 *
 * Per ADR-0008, no writes here — the upstream Google Calendar is the
 * source of truth and the daily `sync-calendar` Edge Function performs the
 * ingestion. Stale events naturally expire as the cron re-pulls.
 */
export class CalendarEventsClient {
  constructor(private readonly client: SupabaseClient) {}

  static fromConfig(
    config: CalendarEventsClientConfig,
  ): CalendarEventsClient {
    return new CalendarEventsClient(
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false },
      }),
    );
  }

  /**
   * Events whose `start` falls within [from, to] (inclusive bounds, ISO
   * strings). Server-side sort is `start` ascending so the UI can merge
   * with Interactions in time order without a second pass.
   */
  async listInRange(input: { from: string; to: string }): Promise<CalendarEvent[]> {
    const { data, error } = await this.client
      .from("inferred_signal_calendar")
      .select(SELECT)
      .gte("start", input.from)
      .lte("start", input.to)
      .order("start", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as CalendarEventRow[]).map(toCalendarEvent);
  }
}
