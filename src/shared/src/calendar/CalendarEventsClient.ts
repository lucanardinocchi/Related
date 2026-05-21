import {
  createClient,
  SupabaseClient,
} from "@supabase/supabase-js";
import type {
  InteractionStatus,
  InteractionCategory,
} from "../interactions/InteractionsClient";

/**
 * Source of a CalendarEvent — currently only Google Calendar (per
 * inferred_signal_calendar). Future sources (Outlook, iCloud) would extend
 * the union without breaking the unified web /calendar timeline.
 */
export type CalendarEventSource = "google";

/**
 * Per-event overlay the User can layer on top of an external (read-only)
 * calendar event. Keyed by (owner_id, event_id). Absence means "no User
 * choice yet" — the Calendar UI shows past unset entries in the pending
 * status widget so the User can decide attended / missed / cancelled.
 */
export interface CalendarEventOverlay {
  eventId: string;
  status: InteractionStatus | null;
  category: InteractionCategory | null;
  updatedAt: string;
}

interface CalendarEventOverlayRow {
  event_id: string;
  status: InteractionStatus | null;
  category: InteractionCategory | null;
  updated_at: string;
}

function toCalendarEventOverlay(
  row: CalendarEventOverlayRow,
): CalendarEventOverlay {
  return {
    eventId: row.event_id,
    status: row.status,
    category: row.category,
    updatedAt: row.updated_at,
  };
}

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

  /** Every overlay the owner has set. Sparse — only events the User has
   * categorised or marked appear here. The Calendar view joins this in
   * memory against the event list by externalEventId. */
  async listOverlays(): Promise<CalendarEventOverlay[]> {
    const { data, error } = await this.client
      .from("inferred_signal_calendar_overlay")
      .select("event_id, status, category, updated_at");
    if (error) throw error;
    return ((data ?? []) as unknown as CalendarEventOverlayRow[]).map(
      toCalendarEventOverlay,
    );
  }

  /** Upsert the per-event overlay. Pass null to clear a previously set
   * value. The (owner_id, event_id) PK makes this idempotent. */
  async upsertOverlay(input: {
    eventId: string;
    ownerId: string;
    status?: InteractionStatus | null;
    category?: InteractionCategory | null;
  }): Promise<void> {
    const patch: Record<string, unknown> = {
      owner_id: input.ownerId,
      event_id: input.eventId,
      updated_at: new Date().toISOString(),
    };
    if (input.status !== undefined) patch.status = input.status;
    if (input.category !== undefined) patch.category = input.category;
    const { error } = await this.client
      .from("inferred_signal_calendar_overlay")
      .upsert(patch, { onConflict: "owner_id,event_id" });
    if (error) throw error;
  }
}
