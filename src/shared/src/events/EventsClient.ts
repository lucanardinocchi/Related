import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type EventType =
  | "work"
  | "meeting"
  | "uni"
  | "personal"
  | "activity";

export type EventStatus =
  | "planned"
  | "occurred"
  | "attended"
  | "cancelled"
  | "missed";

export type EventSource = "manual" | "google" | "outlook";

export interface EventAttendee {
  id: string;
  name: string;
}

/**
 * A first-class calendar Event per ADR-0010 — the /calendar UI's source of
 * truth. Both User-created entries (source='manual') and Google-synced
 * entries (source='google') live in the same shape; the sync only
 * overwrites Google-owned columns and leaves user-owned enrichment (aim,
 * requiredPrep, status, type) alone.
 */
export interface Event {
  id: string;
  title: string | null;
  start: string;
  end: string;
  isAllDay: boolean;
  location: string | null;
  aim: string | null;
  requiredPrep: string | null;
  status: EventStatus;
  type: EventType;
  source: EventSource;
  externalEventId: string | null;
  attendees: EventAttendee[];
}

export interface CreateEventInput {
  title?: string | null;
  start: string;
  end: string;
  isAllDay?: boolean;
  location?: string | null;
  aim?: string | null;
  requiredPrep?: string | null;
  status?: EventStatus;
  type?: EventType;
  contactIds?: string[];
}

export interface UpdateEventInput {
  title?: string | null;
  start?: string;
  end?: string;
  isAllDay?: boolean;
  location?: string | null;
  aim?: string | null;
  requiredPrep?: string | null;
  status?: EventStatus;
  type?: EventType;
}

export interface EventsClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

interface EventRow {
  id: string;
  title: string | null;
  start: string;
  end: string;
  is_all_day: boolean;
  location: string | null;
  aim: string | null;
  required_prep: string | null;
  status: EventStatus;
  type: EventType;
  source: EventSource;
  external_event_id: string | null;
  event_attendees: {
    contact_id: string;
    contacts: { name: string } | null;
  }[];
}

const SELECT =
  "id, title, start, end, is_all_day, location, aim, required_prep, status, type, source, external_event_id, event_attendees(contact_id, contacts(name))";

function toEvent(row: EventRow): Event {
  return {
    id: row.id,
    title: row.title,
    start: row.start,
    end: row.end,
    isAllDay: row.is_all_day,
    location: row.location,
    aim: row.aim,
    requiredPrep: row.required_prep,
    status: row.status,
    type: row.type,
    source: row.source,
    externalEventId: row.external_event_id,
    attendees: (row.event_attendees ?? []).map((link) => ({
      id: link.contact_id,
      name: link.contacts?.name ?? "",
    })),
  };
}

/**
 * Reads and writes user-owned calendar Events. RLS enforces ownership.
 * Google-sourced rows are upserted by the sync-calendar Edge Function on
 * the (owner_id, external_event_id) key; the web UI may freely edit any
 * row's user-owned fields (status, type, aim, requiredPrep) even when
 * source='google'.
 */
export class EventsClient {
  constructor(private readonly client: SupabaseClient) {}

  static fromConfig(config: EventsClientConfig): EventsClient {
    return new EventsClient(
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false },
      }),
    );
  }

  /**
   * Calendar events where the User listed attendees and status is
   * `planned` (upcoming) or `attended` (past). Used for inner-circle scoring.
   */
  async listForAttendeeCloseness(): Promise<Event[]> {
    const { data, error } = await this.client
      .from("events")
      .select(SELECT)
      .in("status", ["planned", "attended"])
      .order("start", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as EventRow[])
      .map(toEvent)
      .filter((e) => e.attendees.length > 0);
  }

  /** Events whose `start` falls in [from, to], time-ascending. */
  async listInRange(input: { from: string; to: string }): Promise<Event[]> {
    const { data, error } = await this.client
      .from("events")
      .select(SELECT)
      .gte("start", input.from)
      .lte("start", input.to)
      .order("start", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as EventRow[]).map(toEvent);
  }

  async getEvent(id: string): Promise<Event> {
    const { data, error } = await this.client
      .from("events")
      .select(SELECT)
      .eq("id", id)
      .single();
    if (error) throw error;
    return toEvent(data as unknown as EventRow);
  }

  /**
   * Create a manual Event for the signed-in User. owner_id is set
   * server-side from auth.uid() via the events_insert_own RLS check —
   * the caller must not pass it. Returns the new id; attendee links land
   * in a second insert.
   */
  async createEvent(input: CreateEventInput): Promise<string> {
    const ownerId = (await this.client.auth.getUser()).data.user?.id;
    if (!ownerId) throw new Error("No signed-in user");

    const insert: Record<string, unknown> = {
      owner_id: ownerId,
      title: input.title ?? null,
      start: input.start,
      end: input.end,
      is_all_day: input.isAllDay ?? false,
      location: input.location ?? null,
      aim: input.aim ?? null,
      required_prep: input.requiredPrep ?? null,
      status: input.status ?? "planned",
      type: input.type ?? "meeting",
      source: "manual",
    };

    const { data, error } = await this.client
      .from("events")
      .insert(insert)
      .select("id")
      .single();
    if (error) throw error;

    const id = (data as { id: string }).id;
    if (input.contactIds && input.contactIds.length > 0) {
      await this.setAttendees(id, input.contactIds);
    }
    return id;
  }

  async updateEvent(
    id: string,
    input: UpdateEventInput,
  ): Promise<Event> {
    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.start !== undefined) patch.start = input.start;
    if (input.end !== undefined) patch.end = input.end;
    if (input.isAllDay !== undefined) patch.is_all_day = input.isAllDay;
    if (input.location !== undefined) patch.location = input.location;
    if (input.aim !== undefined) patch.aim = input.aim;
    if (input.requiredPrep !== undefined)
      patch.required_prep = input.requiredPrep;
    if (input.status !== undefined) patch.status = input.status;
    if (input.type !== undefined) patch.type = input.type;
    patch.updated_at = new Date().toISOString();

    const { data, error } = await this.client
      .from("events")
      .update(patch)
      .eq("id", id)
      .select(SELECT)
      .single();
    if (error) throw error;
    return toEvent(data as unknown as EventRow);
  }

  /**
   * Replace the attendee set for an Event. Deletes then inserts — Supabase
   * doesn't give us a single-call upsert for join tables and the
   * /calendar/[id] page edits one event at a time so the small window of
   * "no attendees" between the two calls is acceptable.
   */
  async setAttendees(id: string, contactIds: string[]): Promise<void> {
    const { error: delErr } = await this.client
      .from("event_attendees")
      .delete()
      .eq("event_id", id);
    if (delErr) throw delErr;

    if (contactIds.length === 0) return;

    const rows = contactIds.map((cid) => ({
      event_id: id,
      contact_id: cid,
    }));
    const { error: insErr } = await this.client
      .from("event_attendees")
      .insert(rows);
    if (insErr) throw insErr;
  }

  async deleteEvent(id: string): Promise<void> {
    const { error } = await this.client
      .from("events")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }
}
