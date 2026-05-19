/**
 * Google Calendar fetcher per ADR-0006. Pure functions over `fetch` — usable
 * from a Deno Edge Function (the sync-calendar function inlines the same
 * logic so it stays a self-contained deploy unit) and from Node tests.
 *
 * Responsibilities:
 *   - Read the User's primary calendar events between asOf and asOf + 7d
 *   - On 401, refresh the access token using refresh_token + client creds
 *   - Surface the refreshed access token + new expiry so the caller can
 *     persist it back to user_provider_tokens
 *
 * The mapping target is RawCalendarEvent (shared/src/signals/calendarDensity).
 */

export interface RawCalendarEvent {
  id: string;
  title: string | null;
  start: string;
  end: string;
  isAllDay: boolean;
}

export interface FetchGoogleCalendarEventsInput {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  asOf: Date;
  /** Injectable for tests; defaults to global fetch. */
  fetch?: typeof fetch;
}

export interface FetchGoogleCalendarEventsResult {
  events: RawCalendarEvent[];
  /**
   * Populated when a 401 forced a refresh during this call. The caller
   * should persist it (plus the new expiresAt) to user_provider_tokens
   * so the next collection round uses the fresh token directly.
   */
  refreshedAccessToken?: string;
  refreshedExpiresInSeconds?: number;
}

const CALENDAR_WINDOW_DAYS = 7;
const CALENDAR_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

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

interface GoogleEventTime {
  dateTime?: string;
  date?: string;
}

interface GoogleEvent {
  id: string;
  summary?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
}

function mapEvent(e: GoogleEvent): RawCalendarEvent | null {
  if (!e.start || !e.end) return null;
  // All-day events arrive with `date`; timed events with `dateTime`.
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
  };
}

async function callEventsApi(
  accessToken: string,
  asOf: Date,
  fetchImpl: typeof fetch,
): Promise<Response> {
  return fetchImpl(buildEventsUrl(asOf), {
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
  let response = await callEventsApi(input.accessToken, input.asOf, fetchImpl);

  let refreshedAccessToken: string | undefined;
  let refreshedExpiresInSeconds: number | undefined;

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
    refreshedAccessToken = refresh.accessToken;
    refreshedExpiresInSeconds = refresh.expiresInSeconds;
    response = await callEventsApi(refresh.accessToken, input.asOf, fetchImpl);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Google Calendar API ${response.status}: ${text || response.statusText}`,
    );
  }

  const data = (await response.json()) as { items?: GoogleEvent[] };
  const events = (data.items ?? [])
    .map(mapEvent)
    .filter((e): e is RawCalendarEvent => e !== null);

  return { events, refreshedAccessToken, refreshedExpiresInSeconds };
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
