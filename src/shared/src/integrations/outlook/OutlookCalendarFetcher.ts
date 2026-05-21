import { OUTLOOK_CALENDAR_SCOPES } from "./outlookScopes";

/**
 * Outlook Calendar fetcher via Microsoft Graph. Pure functions over `fetch` —
 * usable from tests and mirrored inline in the sync-calendar Edge Function.
 */

export interface RawOutlookCalendarEvent {
  id: string;
  title: string | null;
  start: string;
  end: string;
  isAllDay: boolean;
  location: string | null;
  attendeeEmails: string[];
}

export interface FetchOutlookCalendarEventsInput {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  asOf: Date;
  fetch?: typeof fetch;
}

export interface FetchOutlookCalendarEventsResult {
  events: RawOutlookCalendarEvent[];
  refreshedAccessToken?: string;
  refreshedExpiresInSeconds?: number;
}

const CALENDAR_WINDOW_DAYS = 7;
const GRAPH_CALENDAR_VIEW_URL =
  "https://graph.microsoft.com/v1.0/me/calendarView";
const MICROSOFT_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";

function buildCalendarViewUrl(asOf: Date): string {
  const timeMax = new Date(asOf);
  timeMax.setUTCDate(timeMax.getUTCDate() + CALENDAR_WINDOW_DAYS);
  const params = new URLSearchParams({
    startDateTime: asOf.toISOString(),
    endDateTime: timeMax.toISOString(),
    $select: "id,subject,start,end,isAllDay,location,attendees",
    $top: "100",
    $orderby: "start/dateTime",
  });
  return `${GRAPH_CALENDAR_VIEW_URL}?${params.toString()}`;
}

interface GraphDateTime {
  dateTime?: string;
  timeZone?: string;
}

interface GraphAttendee {
  emailAddress?: { address?: string };
}

interface GraphEvent {
  id: string;
  subject?: string;
  start?: GraphDateTime;
  end?: GraphDateTime;
  isAllDay?: boolean;
  location?: { displayName?: string };
  attendees?: GraphAttendee[];
}

export function mapOutlookEvent(e: GraphEvent): RawOutlookCalendarEvent | null {
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

async function callCalendarViewApi(
  accessToken: string,
  asOf: Date,
  fetchImpl: typeof fetch,
): Promise<Response> {
  return fetchImpl(buildCalendarViewUrl(asOf), {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      prefer: 'outlook.timezone="UTC"',
    },
  });
}

export async function fetchOutlookCalendarEvents(
  input: FetchOutlookCalendarEventsInput,
): Promise<FetchOutlookCalendarEventsResult> {
  const fetchImpl = input.fetch ?? fetch;
  let response = await callCalendarViewApi(
    input.accessToken,
    input.asOf,
    fetchImpl,
  );

  let refreshedAccessToken: string | undefined;
  let refreshedExpiresInSeconds: number | undefined;

  if (response.status === 401) {
    if (!input.refreshToken || !input.clientId || !input.clientSecret) {
      throw new Error(
        "Outlook Calendar 401 and no refresh_token / client creds available — User needs to re-consent.",
      );
    }
    const refresh = await refreshOutlookAccessToken({
      refreshToken: input.refreshToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      fetch: fetchImpl,
    });
    refreshedAccessToken = refresh.accessToken;
    refreshedExpiresInSeconds = refresh.expiresInSeconds;
    response = await callCalendarViewApi(
      refresh.accessToken,
      input.asOf,
      fetchImpl,
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Microsoft Graph Calendar ${response.status}: ${text || response.statusText}`,
    );
  }

  const data = (await response.json()) as { value?: GraphEvent[] };
  const events = (data.value ?? [])
    .map(mapOutlookEvent)
    .filter((e): e is RawOutlookCalendarEvent => e !== null);

  return { events, refreshedAccessToken, refreshedExpiresInSeconds };
}

export interface RefreshOutlookAccessTokenInput {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
}

export interface RefreshOutlookAccessTokenResult {
  accessToken: string;
  expiresInSeconds: number;
}

export async function refreshOutlookAccessToken(
  input: RefreshOutlookAccessTokenInput,
): Promise<RefreshOutlookAccessTokenResult> {
  const fetchImpl = input.fetch ?? fetch;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    scope: OUTLOOK_CALENDAR_SCOPES,
  });
  const response = await fetchImpl(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Microsoft token refresh failed (${response.status}): ${text || response.statusText}`,
    );
  }
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new Error("Microsoft token refresh returned no access_token");
  }
  return {
    accessToken: data.access_token,
    expiresInSeconds: data.expires_in ?? 3600,
  };
}
