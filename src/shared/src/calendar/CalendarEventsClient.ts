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
 * cron picks up changes.
 *
 * @deprecated ADR-0010 — web /calendar reads from `events` via EventsClient.
 * Retained for agent signal reads if needed; UserContextBuilder queries
 * inferred_signal_calendar directly for density. Prefer EventsClient for
 * user-facing calendar data.
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
 * Read external Calendar events from `inferred_signal_calendar`. Agent
 * density signal storage only — web /calendar uses EventsClient (ADR-0010).
 * RLS scopes to owner.
 *
 * @deprecated Prefer EventsClient for user-facing calendar data.
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
