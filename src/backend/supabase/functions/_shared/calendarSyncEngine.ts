// deno-lint-ignore-file no-explicit-any
// Deno mirror of shared calendar sync modules — keep in sync with
// src/shared/src/signals/calendarSyncConfig.ts and calendarSyncDualWrite.ts.

const CALENDAR_HISTORY_DAYS = 365;
const CALENDAR_FUTURE_DAYS = 730;
const OUTLOOK_EVENT_PREFIX = "outlook:";

type CalendarSyncProvider = "google" | "outlook";

interface CalendarSyncWindow {
  timeMin: Date;
  timeMax: Date;
}

interface CalendarSyncEvent {
  id: string;
  title?: string | null;
  start: string;
  end: string;
  isAllDay: boolean;
  location?: string | null;
  attendeeEmails?: string[];
}

function buildCalendarSyncWindow(referenceDate: Date = new Date()): CalendarSyncWindow {
  const timeMin = new Date(referenceDate);
  timeMin.setUTCDate(timeMin.getUTCDate() - CALENDAR_HISTORY_DAYS);
  const timeMax = new Date(referenceDate);
  timeMax.setUTCDate(timeMax.getUTCDate() + CALENDAR_FUTURE_DAYS);
  return { timeMin, timeMax };
}

function externalEventIdForProvider(provider: CalendarSyncProvider, eventId: string): string {
  return provider === "outlook" ? `${OUTLOOK_EVENT_PREFIX}${eventId}` : eventId;
}

function signalEventIdForProvider(provider: CalendarSyncProvider, eventId: string): string {
  return externalEventIdForProvider(provider, eventId);
}

function toSignalRowForProvider(provider: CalendarSyncProvider, ownerId: string, event: CalendarSyncEvent) {
  return {
    owner_id: ownerId,
    event_id: provider === "outlook" ? `${OUTLOOK_EVENT_PREFIX}${event.id}` : event.id,
    title: event.title ?? null,
    start: event.start,
    end: event.end,
    is_all_day: event.isAllDay,
  };
}

function toEventsRowForProvider(provider: CalendarSyncProvider, ownerId: string, event: CalendarSyncEvent) {
  return {
    owner_id: ownerId,
    external_event_id: externalEventIdForProvider(provider, event.id),
    source: provider,
    title: event.title ?? null,
    start: event.start,
    end: event.end,
    is_all_day: event.isAllDay,
    location: event.location ?? null,
  };
}

async function persistCalendarSyncSnapshot(
  supabase: any,
  provider: CalendarSyncProvider,
  ownerId: string,
  events: CalendarSyncEvent[],
  options: { window?: { timeMin: string; timeMax: string }; pruneMissing?: boolean } = {},
) {
  const pruneMissing = options.pruneMissing !== false;
  if (events.length > 0) {
    const { error: upErr } = await supabase.from("inferred_signal_calendar").upsert(
      events.map((e) => toSignalRowForProvider(provider, ownerId, e)),
      { onConflict: "owner_id,event_id" },
    );
    if (upErr) return { status: "error" as const, error: String(upErr.message ?? upErr) };
    const { error: evErr } = await supabase.from("events").upsert(
      events.map((e) => toEventsRowForProvider(provider, ownerId, e)),
      { onConflict: "owner_id,external_event_id" },
    );
    if (evErr) return { status: "error" as const, error: String(evErr.message ?? evErr) };
    await syncEventAttendees(supabase, provider, ownerId, events);
  }
  if (pruneMissing) {
    await pruneProviderCalendarRows(
      supabase,
      provider,
      ownerId,
      new Set(events.map((e) => externalEventIdForProvider(provider, e.id))),
      new Set(events.map((e) => signalEventIdForProvider(provider, e.id))),
      options.window,
    );
  }
  return { status: "ok" as const };
}

async function removeCalendarProviderEvent(
  supabase: any,
  provider: CalendarSyncProvider,
  ownerId: string,
  providerEventId: string,
) {
  const externalId = externalEventIdForProvider(provider, providerEventId);
  const signalId = signalEventIdForProvider(provider, providerEventId);
  const { data: rows } = await supabase.from("events").select("id").eq("owner_id", ownerId).eq("external_event_id", externalId).maybeSingle();
  if (rows?.id) {
    await supabase.from("event_attendees").delete().eq("event_id", rows.id);
    await supabase.from("events").delete().eq("id", rows.id);
  }
  await supabase.from("inferred_signal_calendar").delete().eq("owner_id", ownerId).eq("event_id", signalId);
  return { status: "ok" as const };
}

async function syncEventAttendees(supabase: any, provider: CalendarSyncProvider, ownerId: string, events: CalendarSyncEvent[]) {
  const allEmails = Array.from(new Set(events.flatMap((e) => e.attendeeEmails ?? [])));
  let emailToContactId = new Map<string, string>();
  if (allEmails.length > 0) {
    const { data: contactRows } = await supabase.from("contacts").select("id, email").eq("owner_id", ownerId).in("email", allEmails);
    emailToContactId = new Map(((contactRows ?? []) as Array<{ id: string; email: string | null }>).filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c.id]));
  }
  const externalIds = events.map((e) => externalEventIdForProvider(provider, e.id));
  const { data: eventIdRows } = await supabase.from("events").select("id, external_event_id").eq("owner_id", ownerId).in("external_event_id", externalIds);
  const externalToEventId = new Map(((eventIdRows ?? []) as Array<{ id: string; external_event_id: string }>).map((r) => [r.external_event_id, r.id]));
  const touchedEventIds = Array.from(externalToEventId.values());
  if (touchedEventIds.length === 0) return;
  await supabase.from("event_attendees").delete().in("event_id", touchedEventIds);
  const links: Array<{ event_id: string; contact_id: string }> = [];
  for (const e of events) {
    const eventId = externalToEventId.get(externalEventIdForProvider(provider, e.id));
    if (!eventId) continue;
    for (const email of e.attendeeEmails ?? []) {
      const cid = emailToContactId.get(email);
      if (cid) links.push({ event_id: eventId, contact_id: cid });
    }
  }
  if (links.length > 0) await supabase.from("event_attendees").insert(links);
}

async function pruneProviderCalendarRows(
  supabase: any,
  provider: CalendarSyncProvider,
  ownerId: string,
  keepExternalIds: Set<string>,
  keepSignalIds: Set<string>,
  window?: { timeMin: string; timeMax: string },
) {
  let eventsQuery = supabase.from("events").select("id, external_event_id, start").eq("owner_id", ownerId).eq("source", provider);
  if (window) eventsQuery = eventsQuery.gte("start", window.timeMin).lte("start", window.timeMax);
  const { data: existingEvents } = await eventsQuery;
  const eventIdsToDelete = ((existingEvents ?? []) as Array<{ id: string; external_event_id: string }>).filter((row) => !keepExternalIds.has(row.external_event_id)).map((row) => row.id);
  if (eventIdsToDelete.length > 0) {
    await supabase.from("event_attendees").delete().in("event_id", eventIdsToDelete);
    await supabase.from("events").delete().in("id", eventIdsToDelete);
  }
  let signalQuery = supabase.from("inferred_signal_calendar").select("event_id, start").eq("owner_id", ownerId);
  signalQuery = provider === "outlook" ? signalQuery.like("event_id", `${OUTLOOK_EVENT_PREFIX}%`) : signalQuery.not("event_id", "like", `${OUTLOOK_EVENT_PREFIX}%`);
  if (window) signalQuery = signalQuery.gte("start", window.timeMin).lte("start", window.timeMax);
  const { data: existingSignals } = await signalQuery;
  const signalIdsToDelete = ((existingSignals ?? []) as Array<{ event_id: string }>).filter((row) => !keepSignalIds.has(row.event_id)).map((row) => row.event_id);
  if (signalIdsToDelete.length > 0) await supabase.from("inferred_signal_calendar").delete().eq("owner_id", ownerId).in("event_id", signalIdsToDelete);
}


const GOOGLE_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OUTLOOK_CALENDAR_VIEW_URL =
  "https://graph.microsoft.com/v1.0/me/calendarView";
const GRAPH_EVENT_URL = "https://graph.microsoft.com/v1.0/me/events";
const MICROSOFT_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const OUTLOOK_SCOPES =
  "Calendars.Read Mail.Read Mail.Send offline_access User.Read";
const GOOGLE_PAGE_SIZE = 250;
const OUTLOOK_PAGE_SIZE = 100;
const GOOGLE_WATCH_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events/watch";
const GOOGLE_STOP_URL =
  "https://www.googleapis.com/calendar/v3/channels/stop";
const GRAPH_SUBSCRIPTIONS_URL =
  "https://graph.microsoft.com/v1.0/subscriptions";

export interface TokenRow {
  owner_id: string;
  access_token: string;
  refresh_token: string | null;
  scopes: string | null;
}

export interface SyncOwnerOptions {
  window?: CalendarSyncWindow;
  subscribe?: boolean;
  webhookBaseUrl?: string;
}

export interface SyncOwnerResult {
  ownerId: string;
  provider: CalendarSyncProvider;
  eventsWritten: number;
  windowStart: string;
  windowEnd: string;
  status: "ok" | "no_token" | "needs_reconsent" | "error";
  error?: string;
  subscribed?: boolean;
}

interface SubscriptionRow {
  owner_id: string;
  provider: CalendarSyncProvider;
  channel_id: string;
  resource_id: string | null;
  sync_token: string | null;
  client_state: string;
  expires_at: string;
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
  if (!response.ok) throw new Error(`Google token refresh failed (${response.status})`);
  const data = await response.json();
  if (!data.access_token) throw new Error("Google token refresh returned no access_token");
  return { accessToken: data.access_token, expiresInSeconds: data.expires_in ?? 3600 };
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
  if (!response.ok) throw new Error(`Microsoft token refresh failed (${response.status})`);
  const data = await response.json();
  if (!data.access_token) throw new Error("Microsoft token refresh returned no access_token");
  return { accessToken: data.access_token, expiresInSeconds: data.expires_in ?? 3600 };
}

function mapGoogleEvent(e: {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string }>;
}): CalendarSyncEvent | null {
  if (e.status === "cancelled") return null;
  if (!e.start || !e.end) return null;
  const isAllDay = Boolean(e.start.date && !e.start.dateTime);
  const start = e.start.dateTime ?? e.start.date;
  const end = e.end.dateTime ?? e.end.date;
  if (!start || !end) return null;
  return {
    id: e.id,
    title: e.summary ?? null,
    start,
    end,
    isAllDay,
    location: e.location ?? null,
    attendeeEmails: (e.attendees ?? [])
      .map((a) => a.email?.toLowerCase().trim())
      .filter((email): email is string => Boolean(email)),
  };
}

function mapOutlookEvent(e: {
  id: string;
  subject?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  isAllDay?: boolean;
  location?: { displayName?: string };
  attendees?: Array<{ emailAddress?: { address?: string } }>;
}): CalendarSyncEvent | null {
  const start = e.start?.dateTime ?? e.start?.date;
  const end = e.end?.dateTime ?? e.end?.date;
  if (!start || !end) return null;
  return {
    id: e.id,
    title: e.subject ?? null,
    start,
    end,
    isAllDay: e.isAllDay ?? Boolean(e.start?.date && !e.start?.dateTime),
    location: e.location?.displayName ?? null,
    attendeeEmails: (e.attendees ?? [])
      .map((a) => a.emailAddress?.address?.toLowerCase().trim())
      .filter((email): email is string => Boolean(email)),
  };
}

async function fetchGoogleEventsForWindow(
  tokenRow: TokenRow,
  clientId: string,
  clientSecret: string,
  window: CalendarSyncWindow,
): Promise<{
  events: CalendarSyncEvent[];
  nextSyncToken?: string;
  accessToken: string;
  refreshedExpiresInSeconds?: number;
}> {
  let accessToken = tokenRow.access_token;
  let refreshedExpiresInSeconds: number | undefined;
  const events: CalendarSyncEvent[] = [];
  let nextSyncToken: string | undefined;
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      timeMin: window.timeMin.toISOString(),
      timeMax: window.timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(GOOGLE_PAGE_SIZE),
    });
    if (pageToken) params.set("pageToken", pageToken);
    let response = await fetch(`${GOOGLE_EVENTS_URL}?${params}`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    });
    if (response.status === 401 && tokenRow.refresh_token) {
      const refresh = await refreshGoogleAccessToken(
        tokenRow.refresh_token,
        clientId,
        clientSecret,
      );
      accessToken = refresh.accessToken;
      refreshedExpiresInSeconds = refresh.expiresInSeconds;
      response = await fetch(`${GOOGLE_EVENTS_URL}?${params}`, {
        headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      });
    }
    if (!response.ok) throw new Error(`Google Calendar API ${response.status}`);
    const data = await response.json();
    for (const item of data.items ?? []) {
      const mapped = mapGoogleEvent(item);
      if (mapped) events.push(mapped);
    }
    nextSyncToken = data.nextSyncToken ?? nextSyncToken;
    pageToken = data.nextPageToken;
  } while (pageToken);

  return { events, nextSyncToken, accessToken, refreshedExpiresInSeconds };
}

async function fetchGoogleIncremental(
  tokenRow: TokenRow,
  clientId: string,
  clientSecret: string,
  syncToken: string,
): Promise<{
  events: CalendarSyncEvent[];
  deletedEventIds: string[];
  nextSyncToken?: string;
  accessToken: string;
  refreshedExpiresInSeconds?: number;
}> {
  let accessToken = tokenRow.access_token;
  let refreshedExpiresInSeconds: number | undefined;
  const events: CalendarSyncEvent[] = [];
  const deletedEventIds: string[] = [];
  let nextSyncToken: string | undefined;
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ syncToken });
    if (pageToken) params.set("pageToken", pageToken);
    let response = await fetch(`${GOOGLE_EVENTS_URL}?${params}`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    });
    if (response.status === 401 && tokenRow.refresh_token) {
      const refresh = await refreshGoogleAccessToken(
        tokenRow.refresh_token,
        clientId,
        clientSecret,
      );
      accessToken = refresh.accessToken;
      refreshedExpiresInSeconds = refresh.expiresInSeconds;
      response = await fetch(`${GOOGLE_EVENTS_URL}?${params}`, {
        headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      });
    }
    if (response.status === 410) throw new Error("sync_token_expired");
    if (!response.ok) throw new Error(`Google Calendar incremental ${response.status}`);
    const data = await response.json();
    for (const item of data.items ?? []) {
      if (item.status === "cancelled") {
        deletedEventIds.push(item.id);
        continue;
      }
      const mapped = mapGoogleEvent(item);
      if (mapped) events.push(mapped);
    }
    nextSyncToken = data.nextSyncToken ?? nextSyncToken;
    pageToken = data.nextPageToken;
  } while (pageToken);

  return { events, deletedEventIds, nextSyncToken, accessToken, refreshedExpiresInSeconds };
}

async function fetchOutlookEventsForWindow(
  tokenRow: TokenRow,
  clientId: string,
  clientSecret: string,
  window: CalendarSyncWindow,
): Promise<{
  events: CalendarSyncEvent[];
  accessToken: string;
  refreshedExpiresInSeconds?: number;
}> {
  let accessToken = tokenRow.access_token;
  let refreshedExpiresInSeconds: number | undefined;
  const events: CalendarSyncEvent[] = [];
  let url: string | undefined =
    `${OUTLOOK_CALENDAR_VIEW_URL}?${new URLSearchParams({
      startDateTime: window.timeMin.toISOString(),
      endDateTime: window.timeMax.toISOString(),
      $select: "id,subject,start,end,isAllDay,location,attendees",
      $top: String(OUTLOOK_PAGE_SIZE),
      $orderby: "start/dateTime",
    })}`;

  while (url) {
    let response = await fetch(url, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        prefer: 'outlook.timezone="UTC"',
      },
    });
    if (response.status === 401 && tokenRow.refresh_token) {
      const refresh = await refreshOutlookAccessToken(
        tokenRow.refresh_token,
        clientId,
        clientSecret,
      );
      accessToken = refresh.accessToken;
      refreshedExpiresInSeconds = refresh.expiresInSeconds;
      response = await fetch(url, {
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json",
          prefer: 'outlook.timezone="UTC"',
        },
      });
    }
    if (!response.ok) throw new Error(`Microsoft Graph Calendar ${response.status}`);
    const data = await response.json();
    for (const item of data.value ?? []) {
      const mapped = mapOutlookEvent(item);
      if (mapped) events.push(mapped);
    }
    url = data["@odata.nextLink"];
  }

  return { events, accessToken, refreshedExpiresInSeconds };
}

async function fetchOutlookEventById(
  accessToken: string,
  eventId: string,
): Promise<CalendarSyncEvent | null> {
  const url =
    `${GRAPH_EVENT_URL}/${encodeURIComponent(eventId)}?$select=id,subject,start,end,isAllDay,location,attendees`;
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      prefer: 'outlook.timezone="UTC"',
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Microsoft Graph event ${response.status}`);
  return mapOutlookEvent(await response.json());
}

async function persistRefreshedToken(
  supabase: any,
  ownerId: string,
  provider: CalendarSyncProvider,
  accessToken: string,
  expiresInSeconds: number,
): Promise<void> {
  const newExpires = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  await supabase
    .from("user_provider_tokens")
    .update({
      access_token: accessToken,
      expires_at: newExpires,
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", ownerId)
    .eq("provider", provider);
}

export async function syncOwnerCalendarProvider(
  supabase: any,
  provider: CalendarSyncProvider,
  tokenRow: TokenRow,
  clientId: string,
  clientSecret: string,
  options: SyncOwnerOptions = {},
): Promise<SyncOwnerResult> {
  const window = options.window ?? buildCalendarSyncWindow();
  const base = {
    ownerId: tokenRow.owner_id,
    provider,
    windowStart: window.timeMin.toISOString(),
    windowEnd: window.timeMax.toISOString(),
    eventsWritten: 0,
  };

  try {
    let accessToken = tokenRow.access_token;
    let events: CalendarSyncEvent[] = [];
    let nextSyncToken: string | undefined;

    if (provider === "google") {
      const result = await fetchGoogleEventsForWindow(
        tokenRow,
        clientId,
        clientSecret,
        window,
      );
      events = result.events;
      nextSyncToken = result.nextSyncToken;
      accessToken = result.accessToken;
      if (result.refreshedExpiresInSeconds) {
        await persistRefreshedToken(
          supabase,
          tokenRow.owner_id,
          provider,
          accessToken,
          result.refreshedExpiresInSeconds,
        );
      }
    } else {
      const result = await fetchOutlookEventsForWindow(
        tokenRow,
        clientId,
        clientSecret,
        window,
      );
      events = result.events;
      accessToken = result.accessToken;
      if (result.refreshedExpiresInSeconds) {
        await persistRefreshedToken(
          supabase,
          tokenRow.owner_id,
          provider,
          accessToken,
          result.refreshedExpiresInSeconds,
        );
      }
    }

    const writeResult = await persistCalendarSyncSnapshot(
      supabase,
      provider,
      tokenRow.owner_id,
      events,
      {
        window: {
          timeMin: window.timeMin.toISOString(),
          timeMax: window.timeMax.toISOString(),
        },
        pruneMissing: true,
      },
    );
    if (writeResult.status === "error") {
      return { ...base, status: "error", error: writeResult.error };
    }

    let subscribed = false;
    if (options.subscribe && options.webhookBaseUrl) {
      subscribed = await ensureCalendarSubscription(
        supabase,
        provider,
        tokenRow,
        clientId,
        clientSecret,
        options.webhookBaseUrl,
        nextSyncToken ?? null,
        accessToken,
      );
    } else if (nextSyncToken) {
      await upsertSubscriptionSyncToken(
        supabase,
        tokenRow.owner_id,
        provider,
        nextSyncToken,
      );
    }

    return {
      ...base,
      eventsWritten: events.length,
      status: "ok",
      subscribed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/reconsent|401|refresh/i.test(message)) {
      return { ...base, status: "needs_reconsent", error: message };
    }
    return { ...base, status: "error", error: message };
  }
}

async function upsertSubscriptionSyncToken(
  supabase: any,
  ownerId: string,
  provider: CalendarSyncProvider,
  syncToken: string,
): Promise<void> {
  const { data } = await supabase
    .from("calendar_sync_subscriptions")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("provider", provider)
    .maybeSingle();
  if (!data) return;
  await supabase
    .from("calendar_sync_subscriptions")
    .update({ sync_token: syncToken, updated_at: new Date().toISOString() })
    .eq("owner_id", ownerId)
    .eq("provider", provider);
}

function buildClientState(ownerId: string): string {
  return `${ownerId}:${crypto.randomUUID()}`;
}

export async function ensureCalendarSubscription(
  supabase: any,
  provider: CalendarSyncProvider,
  tokenRow: TokenRow,
  clientId: string,
  clientSecret: string,
  webhookBaseUrl: string,
  syncToken: string | null,
  accessTokenOverride?: string,
): Promise<boolean> {
  let accessToken = accessTokenOverride ?? tokenRow.access_token;

  const { data: existing } = await supabase
    .from("calendar_sync_subscriptions")
    .select("*")
    .eq("owner_id", tokenRow.owner_id)
    .eq("provider", provider)
    .maybeSingle();

  if (existing && new Date(existing.expires_at).getTime() > Date.now() + 3600_000) {
    if (syncToken && provider === "google") {
      await upsertSubscriptionSyncToken(
        supabase,
        tokenRow.owner_id,
        provider,
        syncToken,
      );
    }
    return true;
  }

  if (provider === "google") {
    return subscribeGoogle(
      supabase,
      tokenRow,
      accessToken,
      webhookBaseUrl,
      syncToken,
      existing as SubscriptionRow | null,
    );
  }
  return subscribeOutlook(
    supabase,
    tokenRow,
    accessToken,
    clientId,
    clientSecret,
    webhookBaseUrl,
    existing as SubscriptionRow | null,
  );
}

async function subscribeGoogle(
  supabase: any,
  tokenRow: TokenRow,
  accessToken: string,
  webhookBaseUrl: string,
  syncToken: string | null,
  existing: SubscriptionRow | null,
): Promise<boolean> {
  if (existing?.resource_id) {
    await fetch(GOOGLE_STOP_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: existing.channel_id,
        resourceId: existing.resource_id,
      }),
    }).catch(() => undefined);
  }

  const channelId = crypto.randomUUID();
  const clientState = buildClientState(tokenRow.owner_id);
  const address = `${webhookBaseUrl}/functions/v1/google-calendar-webhook`;

  const response = await fetch(GOOGLE_WATCH_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id: channelId,
      type: "web_hook",
      address,
      token: clientState,
    }),
  });

  if (!response.ok) return false;
  const data = await response.json();
  const expiresAt = new Date(Number(data.expiration)).toISOString();

  await supabase.from("calendar_sync_subscriptions").upsert(
    {
      owner_id: tokenRow.owner_id,
      provider: "google",
      channel_id: channelId,
      resource_id: data.resourceId ?? null,
      sync_token: syncToken,
      client_state: clientState,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,provider" },
  );
  return true;
}

async function subscribeOutlook(
  supabase: any,
  tokenRow: TokenRow,
  accessToken: string,
  _clientId: string,
  _clientSecret: string,
  webhookBaseUrl: string,
  existing: SubscriptionRow | null,
): Promise<boolean> {
  if (existing?.channel_id) {
    await fetch(`${GRAPH_SUBSCRIPTIONS_URL}/${existing.channel_id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` },
    }).catch(() => undefined);
  }

  const clientState = buildClientState(tokenRow.owner_id);
  const expiration = new Date(Date.now() + 2.5 * 24 * 60 * 60 * 1000);
  const notificationUrl = `${webhookBaseUrl}/functions/v1/outlook-calendar-webhook`;

  const response = await fetch(GRAPH_SUBSCRIPTIONS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      changeType: "created,updated,deleted",
      notificationUrl,
      resource: "me/events",
      expirationDateTime: expiration.toISOString(),
      clientState,
    }),
  });

  if (!response.ok) return false;
  const data = await response.json();
  await supabase.from("calendar_sync_subscriptions").upsert(
    {
      owner_id: tokenRow.owner_id,
      provider: "outlook",
      channel_id: data.id,
      resource_id: data.resource ?? "me/events",
      sync_token: null,
      client_state: clientState,
      expires_at: data.expirationDateTime ?? expiration.toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,provider" },
  );
  return true;
}

export async function renewExpiringSubscriptions(
  supabase: any,
  webhookBaseUrl: string,
  googleClientId: string,
  googleClientSecret: string,
  microsoftClientId: string,
  microsoftClientSecret: string,
): Promise<{ renewed: number; errors: number }> {
  const threshold = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await supabase
    .from("calendar_sync_subscriptions")
    .select("owner_id, provider")
    .lte("expires_at", threshold);

  let renewed = 0;
  let errors = 0;

  for (const row of rows ?? []) {
    const { data: tokenRow } = await supabase
      .from("user_provider_tokens")
      .select("owner_id, access_token, refresh_token, scopes")
      .eq("owner_id", row.owner_id)
      .eq("provider", row.provider)
      .maybeSingle();
    if (!tokenRow) {
      errors += 1;
      continue;
    }
    const creds = row.provider === "google"
      ? { clientId: googleClientId, clientSecret: googleClientSecret }
      : { clientId: microsoftClientId, clientSecret: microsoftClientSecret };
    const ok = await ensureCalendarSubscription(
      supabase,
      row.provider as CalendarSyncProvider,
      tokenRow as TokenRow,
      creds.clientId,
      creds.clientSecret,
      webhookBaseUrl,
      null,
    );
    if (ok) renewed += 1;
    else errors += 1;
  }

  return { renewed, errors };
}

export async function handleGoogleCalendarPush(
  supabase: any,
  channelId: string,
  resourceState: string,
  googleClientId: string,
  googleClientSecret: string,
): Promise<void> {
  if (resourceState === "sync") return;

  const { data: sub } = await supabase
    .from("calendar_sync_subscriptions")
    .select("*")
    .eq("channel_id", channelId)
    .eq("provider", "google")
    .maybeSingle();
  if (!sub?.sync_token) return;

  const { data: tokenRow } = await supabase
    .from("user_provider_tokens")
    .select("owner_id, access_token, refresh_token, scopes")
    .eq("owner_id", sub.owner_id)
    .eq("provider", "google")
    .maybeSingle();
  if (!tokenRow) return;

  try {
    const result = await fetchGoogleIncremental(
      tokenRow as TokenRow,
      googleClientId,
      googleClientSecret,
      sub.sync_token,
    );

    if (result.refreshedExpiresInSeconds) {
      await persistRefreshedToken(
        supabase,
        sub.owner_id,
        "google",
        result.accessToken,
        result.refreshedExpiresInSeconds,
      );
    }

    for (const eventId of result.deletedEventIds) {
      await removeCalendarProviderEvent(supabase, "google", sub.owner_id, eventId);
    }

    if (result.events.length > 0) {
      await persistCalendarSyncSnapshot(
        supabase,
        "google",
        sub.owner_id,
        result.events,
        { pruneMissing: false },
      );
    }

    if (result.nextSyncToken) {
      await supabase
        .from("calendar_sync_subscriptions")
        .update({
          sync_token: result.nextSyncToken,
          updated_at: new Date().toISOString(),
        })
        .eq("owner_id", sub.owner_id)
        .eq("provider", "google");
    }
  } catch (err) {
    if (err instanceof Error && err.message === "sync_token_expired") {
      await syncOwnerCalendarProvider(
        supabase,
        "google",
        tokenRow as TokenRow,
        googleClientId,
        googleClientSecret,
        { subscribe: false },
      );
    }
    throw err;
  }
}

export async function handleOutlookCalendarPush(
  supabase: any,
  ownerId: string,
  changeType: string,
  eventId: string,
  microsoftClientId: string,
  microsoftClientSecret: string,
): Promise<void> {
  if (!eventId) return;

  if (changeType === "deleted") {
    await removeCalendarProviderEvent(supabase, "outlook", ownerId, eventId);
    return;
  }

  const { data: tokenRow } = await supabase
    .from("user_provider_tokens")
    .select("owner_id, access_token, refresh_token, scopes")
    .eq("owner_id", ownerId)
    .eq("provider", "outlook")
    .maybeSingle();
  if (!tokenRow) return;

  let accessToken = tokenRow.access_token;
  let event = await fetchOutlookEventById(accessToken, eventId);

  if (!event && tokenRow.refresh_token) {
    const refresh = await refreshOutlookAccessToken(
      tokenRow.refresh_token,
      microsoftClientId,
      microsoftClientSecret,
    );
    accessToken = refresh.accessToken;
    await persistRefreshedToken(
      supabase,
      ownerId,
      "outlook",
      accessToken,
      refresh.expiresInSeconds,
    );
    event = await fetchOutlookEventById(accessToken, eventId);
  }

  if (!event) {
    await removeCalendarProviderEvent(supabase, "outlook", ownerId, eventId);
    return;
  }

  await persistCalendarSyncSnapshot(
    supabase,
    "outlook",
    ownerId,
    [event],
    { pruneMissing: false },
  );
}

export function parseClientStateOwnerId(clientState: string | null): string | null {
  if (!clientState) return null;
  const ownerId = clientState.split(":")[0]?.trim();
  return ownerId || null;
}

export function extractOutlookEventId(
  resource: string,
  resourceData?: { id?: string },
): string | null {
  if (resourceData?.id) return resourceData.id;
  const quoted = resource.match(/Events\('([^']+)'\)/i);
  if (quoted?.[1]) return quoted[1];
  const parts = resource.split("/");
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i]?.replace(/[()'"]/g, "").trim();
    if (part && part.toLowerCase() !== "events" && !part.toLowerCase().startsWith("users")) {
      return part;
    }
  }
  return null;
}
