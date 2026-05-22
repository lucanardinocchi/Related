/**
 * Google Calendar fetcher per ADR-0006. Pure functions over `fetch` — usable
 * from a Deno Edge Function and from Node tests.
 */

import {
  buildCalendarSyncWindow,
  type CalendarSyncWindow,
} from "../../signals/calendarSyncConfig";

export interface RawCalendarEvent {
  id: string;
  title: string | null;
  start: string;
  end: string;
  isAllDay: boolean;
  location?: string | null;
  attendeeEmails?: string[];
}

export interface FetchGoogleCalendarEventsInput {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  /** @deprecated Prefer `window`. Kept for tests — uses a 7-day forward slice from asOf. */
  asOf?: Date;
  window?: CalendarSyncWindow;
  /** Injectable for tests; defaults to global fetch. */
  fetch?: typeof fetch;
}

export interface FetchGoogleCalendarEventsResult {
  events: RawCalendarEvent[];
  nextSyncToken?: string;
  refreshedAccessToken?: string;
  refreshedExpiresInSeconds?: number;
}

const CALENDAR_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const PAGE_SIZE = 250;

function resolveWindow(input: FetchGoogleCalendarEventsInput): CalendarSyncWindow {
  if (input.window) return input.window;
  if (input.asOf) {
    const timeMin = input.asOf;
    const timeMax = new Date(input.asOf);
    timeMax.setUTCDate(timeMax.getUTCDate() + 7);
    return { timeMin, timeMax };
  }
  return buildCalendarSyncWindow();
}

function buildEventsListUrl(
  window: CalendarSyncWindow,
  pageToken?: string,
): string {
  const params = new URLSearchParams({
    timeMin: window.timeMin.toISOString(),
    timeMax: window.timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(PAGE_SIZE),
  });
  if (pageToken) params.set("pageToken", pageToken);
  return `${CALENDAR_EVENTS_URL}?${params.toString()}`;
}

function buildSyncTokenUrl(syncToken: string): string {
  const params = new URLSearchParams({ syncToken });
  return `${CALENDAR_EVENTS_URL}?${params.toString()}`;
}

interface GoogleEventTime {
  dateTime?: string;
  date?: string;
}

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  attendees?: Array<{ email?: string }>;
}

export function mapGoogleCalendarEvent(e: GoogleEvent): RawCalendarEvent | null {
  if (e.status === "cancelled") return null;
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

async function callEventsApi(
  accessToken: string,
  url: string,
  fetchImpl: typeof fetch,
): Promise<Response> {
  return fetchImpl(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
}

export async function fetchGoogleCalendarEvents(
  input: FetchGoogleCalendarEventsInput,
): Promise<FetchGoogleCalendarEventsResult> {
  const fetchImpl = input.fetch ?? fetch;
  const window = resolveWindow(input);
  let accessToken = input.accessToken;
  let refreshedAccessToken: string | undefined;
  let refreshedExpiresInSeconds: number | undefined;

  async function load(url: string) {
    let response = await callEventsApi(accessToken, url, fetchImpl);
    if (response.status === 401) {
      if (!input.refreshToken || !input.clientId || !input.clientSecret) {
        throw new Error(
          "Google Calendar 401 and no refresh_token / client creds available — User needs to re-consent.",
        );
      }
      const refresh = await refreshGoogleAccessToken({
        refreshToken: input.refreshToken,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        fetch: fetchImpl,
      });
      accessToken = refresh.accessToken;
      refreshedAccessToken = refresh.accessToken;
      refreshedExpiresInSeconds = refresh.expiresInSeconds;
      response = await callEventsApi(accessToken, url, fetchImpl);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Google Calendar API ${response.status}: ${text || response.statusText}`,
      );
    }
    return response;
  }

  const events: RawCalendarEvent[] = [];
  let url: string | undefined = buildEventsListUrl(window);
  let nextSyncToken: string | undefined;

  while (url) {
    const response = await load(url);
    const data = (await response.json()) as {
      items?: GoogleEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };
    for (const item of data.items ?? []) {
      const mapped = mapGoogleCalendarEvent(item);
      if (mapped) events.push(mapped);
    }
    nextSyncToken = data.nextSyncToken ?? nextSyncToken;
    if (data.nextPageToken) {
      url = buildEventsListUrl(window, data.nextPageToken);
    } else {
      url = undefined;
    }
  }

  return { events, nextSyncToken, refreshedAccessToken, refreshedExpiresInSeconds };
}

export interface FetchGoogleCalendarIncrementalInput {
  accessToken: string;
  syncToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  fetch?: typeof fetch;
}

export interface GoogleCalendarIncrementalResult {
  events: RawCalendarEvent[];
  deletedEventIds: string[];
  nextSyncToken?: string;
  refreshedAccessToken?: string;
  refreshedExpiresInSeconds?: number;
}

export async function fetchGoogleCalendarIncremental(
  input: FetchGoogleCalendarIncrementalInput,
): Promise<GoogleCalendarIncrementalResult> {
  const fetchImpl = input.fetch ?? fetch;
  let accessToken = input.accessToken;
  let refreshedAccessToken: string | undefined;
  let refreshedExpiresInSeconds: number | undefined;

  async function load(url: string) {
    let response = await callEventsApi(accessToken, url, fetchImpl);
    if (response.status === 401) {
      if (!input.refreshToken || !input.clientId || !input.clientSecret) {
        throw new Error("Google Calendar 401 — User needs to re-consent.");
      }
      const refresh = await refreshGoogleAccessToken({
        refreshToken: input.refreshToken,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        fetch: fetchImpl,
      });
      accessToken = refresh.accessToken;
      refreshedAccessToken = refresh.accessToken;
      refreshedExpiresInSeconds = refresh.expiresInSeconds;
      response = await callEventsApi(accessToken, url, fetchImpl);
    }
    if (response.status === 410) {
      throw new Error("sync_token_expired");
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Google Calendar incremental ${response.status}: ${text || response.statusText}`,
      );
    }
    return response;
  }

  const events: RawCalendarEvent[] = [];
  const deletedEventIds: string[] = [];
  let url: string | undefined = buildSyncTokenUrl(input.syncToken);
  let nextSyncToken: string | undefined;

  while (url) {
    const response = await load(url);
    const data = (await response.json()) as {
      items?: GoogleEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };
    for (const item of data.items ?? []) {
      if (item.status === "cancelled") {
        deletedEventIds.push(item.id);
        continue;
      }
      const mapped = mapGoogleCalendarEvent(item);
      if (mapped) events.push(mapped);
    }
    nextSyncToken = data.nextSyncToken ?? nextSyncToken;
    url = data.nextPageToken
      ? `${buildSyncTokenUrl(input.syncToken)}&pageToken=${encodeURIComponent(data.nextPageToken)}`
      : undefined;
  }

  return {
    events,
    deletedEventIds,
    nextSyncToken,
    refreshedAccessToken,
    refreshedExpiresInSeconds,
  };
}

export interface RefreshGoogleAccessTokenInput {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
}

export interface RefreshGoogleAccessTokenResult {
  accessToken: string;
  expiresInSeconds: number;
}

export async function refreshGoogleAccessToken(
  input: RefreshGoogleAccessTokenInput,
): Promise<RefreshGoogleAccessTokenResult> {
  const fetchImpl = input.fetch ?? fetch;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    client_secret: input.clientSecret,
  });
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Google token refresh failed (${response.status}): ${text || response.statusText}`,
    );
  }
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new Error("Google token refresh returned no access_token");
  }
  return {
    accessToken: data.access_token,
    expiresInSeconds: data.expires_in ?? 3600,
  };
}
