// Daily Calendar density collector — Edge Function.
//
// DUAL-WRITE INVARIANT (ADR-0010) — keep in sync with
// src/shared/src/signals/calendarSyncDualWrite.ts:
//
//   inferred_signal_calendar          events (source='google')
//   ─────────────────────────         ─────────────────────────
//   Agent density input only          User-facing /calendar surface
//   Upsert key: (owner_id, event_id)  Upsert key: (owner_id, external_event_id)
//   Columns: title, start, end,       Google-owned (overwritten on sync):
//            is_all_day                 title, start, end, is_all_day, location
//   Full replace per 7-day window     User-owned (preserved on upsert):
//                                       aim, required_prep, status, type
//   GC: delete rows not in fetch       GC: delete google rows not in fetch
//                                       (manual events untouched)
//
// Per ADR-0006, this iterates over every User who has a row in
// `user_provider_tokens` for provider='google', pulls their next 7 days
// of Calendar events from Google's API using their stored access token,
// refreshes the token on 401 (writing the new token back), and upserts
// the events into `inferred_signal_calendar` keyed on (owner_id, event_id).
//
// Triggered by pg_cron at 10 AM UTC (per-User-local time is a deferred
// refinement). Can also be POSTed manually with `{ ownerId, asOf? }` to
// sync a single User on demand.
//
// The Google fetcher logic is duplicated from
// `src/shared/src/integrations/google/GoogleCalendarFetcher.ts` because
// `@related/shared` isn't on npm and Deno's NPM specifiers can't cross
// the workspace boundary cleanly. The contract is the same — change
// must be mirrored.
//
// Deploy:
//   supabase secrets set GOOGLE_OAUTH_CLIENT_ID=...
//   supabase secrets set GOOGLE_OAUTH_CLIENT_SECRET=...
//   supabase functions deploy sync-calendar

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

interface RawCalendarEvent {
  id: string;
  title: string | null;
  start: string;
  end: string;
  isAllDay: boolean;
  location: string | null;
  attendeeEmails: string[];
}

interface SyncRequest {
  asOf?: string;
  ownerId?: string;
}

interface CalendarCollectionSummary {
  ownerId: string;
  eventsWritten: number;
  windowEnd: string;
  status: "ok" | "no_token" | "needs_reconsent" | "error";
  error?: string;
}

const CALENDAR_WINDOW_DAYS = 7;
const CALENDAR_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface GoogleEventTime {
  dateTime?: string;
  date?: string;
}
interface GoogleAttendee {
  email?: string;
  responseStatus?: string;
}
interface GoogleEvent {
  id: string;
  summary?: string;
  location?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  attendees?: GoogleAttendee[];
}

function buildEventsUrl(asOf: Date): string {
  const timeMax = new Date(asOf);
  timeMax.setUTCDate(timeMax.getUTCDate() + CALENDAR_WINDOW_DAYS);
  const params = new URLSearchParams({
    timeMin: asOf.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });
  return `${CALENDAR_EVENTS_URL}?${params.toString()}`;
}

function mapEvent(e: GoogleEvent): RawCalendarEvent | null {
  if (!e.start || !e.end) return null;
  const isAllDay = Boolean(e.start.date && !e.start.dateTime);
  const start = e.start.dateTime ?? e.start.date;
  const end = e.end.dateTime ?? e.end.date;
  if (!start || !end) return null;
  const attendeeEmails = (e.attendees ?? [])
    .map((a) => a.email?.toLowerCase().trim())
    .filter((email): email is string => Boolean(email));
  return {
    id: e.id,
    title: e.summary ?? null,
    start,
    end,
    isAllDay,
    location: e.location ?? null,
    attendeeEmails,
  };
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(`Google token refresh failed (${response.status})`);
  }
  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Google token refresh returned no access_token");
  }
  return {
    accessToken: data.access_token,
    expiresInSeconds: data.expires_in ?? 3600,
  };
}

async function fetchEvents(
  accessToken: string,
  asOf: Date,
): Promise<Response> {
  return fetch(buildEventsUrl(asOf), {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
}

async function collectForOwner(
  supabase: any,
  tokenRow: {
    owner_id: string;
    access_token: string;
    refresh_token: string | null;
  },
  asOf: Date,
  clientId: string,
  clientSecret: string,
): Promise<CalendarCollectionSummary> {
  const windowEnd = new Date(asOf);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + CALENDAR_WINDOW_DAYS);
  const baseSummary = {
    ownerId: tokenRow.owner_id,
    windowEnd: windowEnd.toISOString(),
    eventsWritten: 0,
  };

  let accessToken = tokenRow.access_token;
  let response = await fetchEvents(accessToken, asOf);

  if (response.status === 401) {
    if (!tokenRow.refresh_token) {
      return { ...baseSummary, status: "needs_reconsent" };
    }
    try {
      const refresh = await refreshAccessToken(
        tokenRow.refresh_token,
        clientId,
        clientSecret,
      );
      accessToken = refresh.accessToken;
      // Persist the new token back. Empty refresh_token? Keep the old one.
      const newExpires = new Date(
        Date.now() + refresh.expiresInSeconds * 1000,
      ).toISOString();
      await supabase
        .from("user_provider_tokens")
        .update({ access_token: accessToken, expires_at: newExpires })
        .eq("owner_id", tokenRow.owner_id)
        .eq("provider", "google");
      response = await fetchEvents(accessToken, asOf);
    } catch (err) {
      return {
        ...baseSummary,
        status: "needs_reconsent",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (!response.ok) {
    return {
      ...baseSummary,
      status: "error",
      error: `Google Calendar API ${response.status}`,
    };
  }

  const data = await response.json();
  const events = ((data.items ?? []) as GoogleEvent[])
    .map(mapEvent)
    .filter((e): e is RawCalendarEvent => e !== null);

  if (events.length > 0) {
    // 1) Keep populating inferred_signal_calendar — the calendarDensity
    //    signal (UserContextBuilder) still reads from there.
    const signalRows = events.map((e) => ({
      owner_id: tokenRow.owner_id,
      event_id: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      is_all_day: e.isAllDay,
    }));
    const { error: upErr } = await supabase
      .from("inferred_signal_calendar")
      .upsert(signalRows, { onConflict: "owner_id,event_id" });
    if (upErr) {
      return {
        ...baseSummary,
        status: "error",
        error: `upsert: ${upErr.message ?? String(upErr)}`,
      };
    }

    // 2) Materialize into the user-facing `events` table per ADR-0010.
    //    Only Google-owned columns are in the payload; on conflict the
    //    user-owned columns (aim, required_prep, status, type) are left
    //    untouched because they aren't named in the update set.
    const eventRows = events.map((e) => ({
      owner_id: tokenRow.owner_id,
      external_event_id: e.id,
      source: "google" as const,
      title: e.title,
      start: e.start,
      end: e.end,
      is_all_day: e.isAllDay,
      location: e.location,
    }));
    const { error: evErr } = await supabase
      .from("events")
      .upsert(eventRows, { onConflict: "owner_id,external_event_id" });
    if (evErr) {
      return {
        ...baseSummary,
        status: "error",
        error: `events upsert: ${evErr.message ?? String(evErr)}`,
      };
    }

    // 3) Refresh attendee links for synced events. Map Google attendee
    //    emails → existing contacts by email (case-insensitive match
    //    already applied in mapEvent). Unmatched emails are dropped in v1.
    const allEmails = Array.from(
      new Set(events.flatMap((e) => e.attendeeEmails)),
    );
    let emailToContactId = new Map<string, string>();
    if (allEmails.length > 0) {
      const { data: contactRows } = await supabase
        .from("contacts")
        .select("id, email")
        .eq("owner_id", tokenRow.owner_id)
        .in("email", allEmails);
      emailToContactId = new Map(
        ((contactRows ?? []) as Array<{ id: string; email: string | null }>)
          .filter((c) => c.email)
          .map((c) => [c.email!.toLowerCase(), c.id]),
      );
    }

    // We need event UUIDs to write attendee links. The upsert above
    // doesn't return ids in supabase-js v2 in one call, so re-select.
    const externalIds = events.map((e) => e.id);
    const { data: eventIdRows } = await supabase
      .from("events")
      .select("id, external_event_id")
      .eq("owner_id", tokenRow.owner_id)
      .in("external_event_id", externalIds);
    const externalToEventId = new Map(
      ((eventIdRows ?? []) as Array<{
        id: string;
        external_event_id: string;
      }>).map((r) => [r.external_event_id, r.id]),
    );

    // For idempotency: wipe existing attendee links for the touched
    // events, then re-insert from the current Google snapshot. This is
    // also how user-removed attendees vanish on the next sync.
    const touchedEventIds = Array.from(externalToEventId.values());
    if (touchedEventIds.length > 0) {
      await supabase
        .from("event_attendees")
        .delete()
        .in("event_id", touchedEventIds);

      const links: Array<{ event_id: string; contact_id: string }> = [];
      for (const e of events) {
        const eventId = externalToEventId.get(e.id);
        if (!eventId) continue;
        for (const email of e.attendeeEmails) {
          const cid = emailToContactId.get(email);
          if (cid) links.push({ event_id: eventId, contact_id: cid });
        }
      }
      if (links.length > 0) {
        await supabase.from("event_attendees").insert(links);
      }
    }
  }

  // GC: remove rows for this owner not in the fetched set. Applies to
  // both signal and events tables — but for `events` only delete rows
  // with source='google' so manually-created events aren't nuked.
  if (events.length > 0) {
    const keepList = events.map((e) => e.id).join(",");
    await supabase
      .from("inferred_signal_calendar")
      .delete()
      .eq("owner_id", tokenRow.owner_id)
      .not("event_id", "in", `(${keepList})`);
    await supabase
      .from("events")
      .delete()
      .eq("owner_id", tokenRow.owner_id)
      .eq("source", "google")
      .not("external_event_id", "in", `(${keepList})`);
  } else {
    await supabase
      .from("inferred_signal_calendar")
      .delete()
      .eq("owner_id", tokenRow.owner_id);
    await supabase
      .from("events")
      .delete()
      .eq("owner_id", tokenRow.owner_id)
      .eq("source", "google");
  }

  return { ...baseSummary, eventsWritten: events.length, status: "ok" };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.warn("[sync-calendar] SUPABASE_URL / SERVICE_ROLE_KEY missing");
}
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn(
    "[sync-calendar] GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET missing — refresh-on-401 will fail",
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  let body: SyncRequest = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const asOf = body.asOf ? new Date(body.asOf) : new Date();
  if (Number.isNaN(asOf.getTime())) {
    return new Response(JSON.stringify({ error: "invalid asOf" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL ?? "", SERVICE_ROLE_KEY ?? "");

  try {
    let tokens: Array<{
      owner_id: string;
      access_token: string;
      refresh_token: string | null;
    }>;
    if (body.ownerId) {
      const { data, error } = await supabase
        .from("user_provider_tokens")
        .select("owner_id, access_token, refresh_token")
        .eq("provider", "google")
        .eq("owner_id", body.ownerId);
      if (error) throw error;
      tokens = (data ?? []) as typeof tokens;
    } else {
      const { data, error } = await supabase
        .from("user_provider_tokens")
        .select("owner_id, access_token, refresh_token")
        .eq("provider", "google");
      if (error) throw error;
      tokens = (data ?? []) as typeof tokens;
    }

    const summaries: CalendarCollectionSummary[] = [];
    for (const t of tokens) {
      summaries.push(
        await collectForOwner(
          supabase,
          t,
          asOf,
          CLIENT_ID ?? "",
          CLIENT_SECRET ?? "",
        ),
      );
    }

    return new Response(
      JSON.stringify({ provider: "google", summaries }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
