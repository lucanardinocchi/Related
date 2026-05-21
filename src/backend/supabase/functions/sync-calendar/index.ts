// Daily Calendar density collector — Edge Function.
//
// DUAL-WRITE INVARIANT (ADR-0010) — keep in sync with
// src/shared/src/signals/calendarSyncDualWrite.ts:
//
//   inferred_signal_calendar          events (source='google'|'outlook')
//   ─────────────────────────         ─────────────────────────
//   Agent density input only          User-facing /calendar surface
//   Upsert key: (owner_id, event_id)  Upsert key: (owner_id, external_event_id)
//   Outlook event_ids prefixed        Outlook external_event_id prefixed
//   with `outlook:`                   with `outlook:`
//
// Per ADR-0006, this iterates over every User who has a row in
// `user_provider_tokens` for provider='google' or provider='outlook',
// pulls their next 7 days of events, refreshes tokens on 401, and
// dual-writes into inferred_signal_calendar + events.
//
// Triggered by pg_cron at 10 AM UTC. Can also be POSTed manually with
// `{ ownerId, asOf? }` to sync a single User on demand.
//
// Fetcher logic is duplicated from shared integrations because
// `@related/shared` isn't on npm for Deno imports.
//
// Deploy:
//   supabase secrets set GOOGLE_OAUTH_CLIENT_ID=...
//   supabase secrets set GOOGLE_OAUTH_CLIENT_SECRET=...
//   supabase secrets set MICROSOFT_CLIENT_ID=...
//   supabase secrets set MICROSOFT_CLIENT_SECRET=...
//   supabase functions deploy sync-calendar

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

type CalendarProvider = "google" | "outlook";

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
  provider: CalendarProvider;
  eventsWritten: number;
  windowEnd: string;
  status: "ok" | "no_token" | "needs_reconsent" | "error";
  error?: string;
}

const CALENDAR_WINDOW_DAYS = 7;
const CALENDAR_PROVIDERS: CalendarProvider[] = ["google", "outlook"];
const OUTLOOK_EVENT_PREFIX = "outlook:";

const GOOGLE_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OUTLOOK_CALENDAR_VIEW_URL =
  "https://graph.microsoft.com/v1.0/me/calendarView";
const MICROSOFT_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const OUTLOOK_SCOPES = "Calendars.Read offline_access User.Read";

function buildGoogleEventsUrl(asOf: Date): string {
  const timeMax = new Date(asOf);
  timeMax.setUTCDate(timeMax.getUTCDate() + CALENDAR_WINDOW_DAYS);
  const params = new URLSearchParams({
    timeMin: asOf.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });
  return `${GOOGLE_EVENTS_URL}?${params.toString()}`;
}

function buildOutlookCalendarViewUrl(asOf: Date): string {
  const timeMax = new Date(asOf);
  timeMax.setUTCDate(timeMax.getUTCDate() + CALENDAR_WINDOW_DAYS);
  const params = new URLSearchParams({
    startDateTime: asOf.toISOString(),
    endDateTime: timeMax.toISOString(),
    $select: "id,subject,start,end,isAllDay,location,attendees",
    $top: "100",
    $orderby: "start/dateTime",
  });
  return `${OUTLOOK_CALENDAR_VIEW_URL}?${params.toString()}`;
}

function mapGoogleEvent(e: {
  id: string;
  summary?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string }>;
}): RawCalendarEvent | null {
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

function mapOutlookEvent(e: {
  id: string;
  subject?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  isAllDay?: boolean;
  location?: { displayName?: string };
  attendees?: Array<{ emailAddress?: { address?: string } }>;
}): RawCalendarEvent | null {
  if (!e.start?.dateTime || !e.end?.dateTime) return null;
  const attendeeEmails = (e.attendees ?? [])
    .map((a) => a.emailAddress?.address?.toLowerCase().trim())
    .filter((email): email is string => Boolean(email));
  return {
    id: e.id,
    title: e.subject ?? null,
    start: e.start.dateTime,
    end: e.end.dateTime,
    isAllDay: e.isAllDay ?? false,
    location: e.location?.displayName ?? null,
    attendeeEmails,
  };
}

function toSignalEventId(provider: CalendarProvider, eventId: string): string {
  return provider === "outlook" ? `${OUTLOOK_EVENT_PREFIX}${eventId}` : eventId;
}

function toExternalEventId(provider: CalendarProvider, eventId: string): string {
  return provider === "outlook" ? `${OUTLOOK_EVENT_PREFIX}${eventId}` : eventId;
}

async function refreshGoogleAccessToken(
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

async function refreshOutlookAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    scope: OUTLOOK_SCOPES,
  });
  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(`Microsoft token refresh failed (${response.status})`);
  }
  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Microsoft token refresh returned no access_token");
  }
  return {
    accessToken: data.access_token,
    expiresInSeconds: data.expires_in ?? 3600,
  };
}

async function fetchGoogleEvents(
  accessToken: string,
  asOf: Date,
): Promise<Response> {
  return fetch(buildGoogleEventsUrl(asOf), {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
}

async function fetchOutlookEvents(
  accessToken: string,
  asOf: Date,
): Promise<Response> {
  return fetch(buildOutlookCalendarViewUrl(asOf), {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      prefer: 'outlook.timezone="UTC"',
    },
  });
}

async function persistSnapshot(
  supabase: any,
  provider: CalendarProvider,
  ownerId: string,
  events: RawCalendarEvent[],
): Promise<{ status: "ok" | "error"; error?: string }> {
  if (events.length > 0) {
    const signalRows = events.map((e) => ({
      owner_id: ownerId,
      event_id: toSignalEventId(provider, e.id),
      title: e.title,
      start: e.start,
      end: e.end,
      is_all_day: e.isAllDay,
    }));
    const { error: upErr } = await supabase
      .from("inferred_signal_calendar")
      .upsert(signalRows, { onConflict: "owner_id,event_id" });
    if (upErr) {
      return { status: "error", error: `upsert: ${upErr.message ?? String(upErr)}` };
    }

    const eventRows = events.map((e) => ({
      owner_id: ownerId,
      external_event_id: toExternalEventId(provider, e.id),
      source: provider,
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
        status: "error",
        error: `events upsert: ${evErr.message ?? String(evErr)}`,
      };
    }

    const allEmails = Array.from(
      new Set(events.flatMap((e) => e.attendeeEmails)),
    );
    let emailToContactId = new Map<string, string>();
    if (allEmails.length > 0) {
      const { data: contactRows } = await supabase
        .from("contacts")
        .select("id, email")
        .eq("owner_id", ownerId)
        .in("email", allEmails);
      emailToContactId = new Map(
        ((contactRows ?? []) as Array<{ id: string; email: string | null }>)
          .filter((c) => c.email)
          .map((c) => [c.email!.toLowerCase(), c.id]),
      );
    }

    const externalIds = events.map((e) => toExternalEventId(provider, e.id));
    const { data: eventIdRows } = await supabase
      .from("events")
      .select("id, external_event_id")
      .eq("owner_id", ownerId)
      .in("external_event_id", externalIds);
    const externalToEventId = new Map(
      ((eventIdRows ?? []) as Array<{
        id: string;
        external_event_id: string;
      }>).map((r) => [r.external_event_id, r.id]),
    );

    const touchedEventIds = Array.from(externalToEventId.values());
    if (touchedEventIds.length > 0) {
      await supabase
        .from("event_attendees")
        .delete()
        .in("event_id", touchedEventIds);

      const links: Array<{ event_id: string; contact_id: string }> = [];
      for (const e of events) {
        const eventId = externalToEventId.get(
          toExternalEventId(provider, e.id),
        );
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

  const keepList = events
    .map((e) => toSignalEventId(provider, e.id))
    .join(",");
  const externalKeepList = events
    .map((e) => toExternalEventId(provider, e.id))
    .join(",");

  if (provider === "google") {
    if (events.length > 0) {
      await supabase
        .from("inferred_signal_calendar")
        .delete()
        .eq("owner_id", ownerId)
        .not("event_id", "in", `(${keepList})`)
        .not("event_id", "like", `${OUTLOOK_EVENT_PREFIX}%`);
      await supabase
        .from("events")
        .delete()
        .eq("owner_id", ownerId)
        .eq("source", "google")
        .not("external_event_id", "in", `(${externalKeepList})`);
    } else {
      await supabase
        .from("inferred_signal_calendar")
        .delete()
        .eq("owner_id", ownerId)
        .not("event_id", "like", `${OUTLOOK_EVENT_PREFIX}%`);
      await supabase
        .from("events")
        .delete()
        .eq("owner_id", ownerId)
        .eq("source", "google");
    }
  } else {
    if (events.length > 0) {
      await supabase
        .from("inferred_signal_calendar")
        .delete()
        .eq("owner_id", ownerId)
        .like("event_id", `${OUTLOOK_EVENT_PREFIX}%`)
        .not("event_id", "in", `(${keepList})`);
      await supabase
        .from("events")
        .delete()
        .eq("owner_id", ownerId)
        .eq("source", "outlook")
        .not("external_event_id", "in", `(${externalKeepList})`);
    } else {
      await supabase
        .from("inferred_signal_calendar")
        .delete()
        .eq("owner_id", ownerId)
        .like("event_id", `${OUTLOOK_EVENT_PREFIX}%`);
      await supabase
        .from("events")
        .delete()
        .eq("owner_id", ownerId)
        .eq("source", "outlook");
    }
  }

  return { status: "ok" };
}

async function collectForOwner(
  supabase: any,
  provider: CalendarProvider,
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
    provider,
    windowEnd: windowEnd.toISOString(),
    eventsWritten: 0,
  };

  let accessToken = tokenRow.access_token;
  let response =
    provider === "google"
      ? await fetchGoogleEvents(accessToken, asOf)
      : await fetchOutlookEvents(accessToken, asOf);

  if (response.status === 401) {
    if (!tokenRow.refresh_token) {
      return { ...baseSummary, status: "needs_reconsent" };
    }
    try {
      const refresh =
        provider === "google"
          ? await refreshGoogleAccessToken(
            tokenRow.refresh_token,
            clientId,
            clientSecret,
          )
          : await refreshOutlookAccessToken(
            tokenRow.refresh_token,
            clientId,
            clientSecret,
          );
      accessToken = refresh.accessToken;
      const newExpires = new Date(
        Date.now() + refresh.expiresInSeconds * 1000,
      ).toISOString();
      await supabase
        .from("user_provider_tokens")
        .update({ access_token: accessToken, expires_at: newExpires })
        .eq("owner_id", tokenRow.owner_id)
        .eq("provider", provider);
      response =
        provider === "google"
          ? await fetchGoogleEvents(accessToken, asOf)
          : await fetchOutlookEvents(accessToken, asOf);
    } catch (err) {
      return {
        ...baseSummary,
        status: "needs_reconsent",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (!response.ok) {
    const apiName = provider === "google" ? "Google Calendar API" : "Microsoft Graph";
    return {
      ...baseSummary,
      status: "error",
      error: `${apiName} ${response.status}`,
    };
  }

  const data = await response.json();
  const events =
    provider === "google"
      ? ((data.items ?? []) as Parameters<typeof mapGoogleEvent>[0][])
        .map(mapGoogleEvent)
        .filter((e): e is RawCalendarEvent => e !== null)
      : ((data.value ?? []) as Parameters<typeof mapOutlookEvent>[0][])
        .map(mapOutlookEvent)
        .filter((e): e is RawCalendarEvent => e !== null);

  const writeResult = await persistSnapshot(
    supabase,
    provider,
    tokenRow.owner_id,
    events,
  );
  if (writeResult.status === "error") {
    return { ...baseSummary, status: "error", error: writeResult.error };
  }

  return { ...baseSummary, eventsWritten: events.length, status: "ok" };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.warn("[sync-calendar] SUPABASE_URL / SERVICE_ROLE_KEY missing");
}
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn(
    "[sync-calendar] GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET missing",
  );
}
if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
  console.warn(
    "[sync-calendar] MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET missing",
  );
}

function clientCredsForProvider(provider: CalendarProvider): {
  clientId: string;
  clientSecret: string;
} {
  if (provider === "google") {
    return {
      clientId: GOOGLE_CLIENT_ID ?? "",
      clientSecret: GOOGLE_CLIENT_SECRET ?? "",
    };
  }
  return {
    clientId: MICROSOFT_CLIENT_ID ?? "",
    clientSecret: MICROSOFT_CLIENT_SECRET ?? "",
  };
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
    let query = supabase
      .from("user_provider_tokens")
      .select("owner_id, provider, access_token, refresh_token")
      .in("provider", CALENDAR_PROVIDERS);
    if (body.ownerId) {
      query = query.eq("owner_id", body.ownerId);
    }
    const { data, error } = await query;
    if (error) throw error;

    const tokens = (data ?? []) as Array<{
      owner_id: string;
      provider: CalendarProvider;
      access_token: string;
      refresh_token: string | null;
    }>;

    const summaries: CalendarCollectionSummary[] = [];
    for (const t of tokens) {
      const creds = clientCredsForProvider(t.provider);
      summaries.push(
        await collectForOwner(
          supabase,
          t.provider,
          t,
          asOf,
          creds.clientId,
          creds.clientSecret,
        ),
      );
    }

    return new Response(JSON.stringify({ summaries }), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
