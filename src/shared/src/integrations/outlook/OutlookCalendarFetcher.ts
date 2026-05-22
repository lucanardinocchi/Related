import { OUTLOOK_CALENDAR_SCOPES } from "./outlookScopes";
import {
  buildCalendarSyncWindow,
  type CalendarSyncWindow,
} from "../../signals/calendarSyncConfig";

/**
 * Outlook Calendar fetcher via Microsoft Graph. Pure functions over `fetch`.
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
  /** @deprecated Prefer `window`. Uses 7-day forward slice from asOf. */
  asOf?: Date;
  window?: CalendarSyncWindow;
  fetch?: typeof fetch;
}

export interface FetchOutlookCalendarEventsResult {
  events: RawOutlookCalendarEvent[];
  refreshedAccessToken?: string;
  refreshedExpiresInSeconds?: number;
}

const GRAPH_CALENDAR_VIEW_URL =
  "https://graph.microsoft.com/v1.0/me/calendarView";
const GRAPH_EVENT_URL = "https://graph.microsoft.com/v1.0/me/events";
const MICROSOFT_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const PAGE_SIZE = 100;

function resolveWindow(input: FetchOutlookCalendarEventsInput): CalendarSyncWindow {
  if (input.window) return input.window;
  if (input.asOf) {
    const timeMin = input.asOf;
    const timeMax = new Date(input.asOf);
    timeMax.setUTCDate(timeMax.getUTCDate() + 7);
    return { timeMin, timeMax };
  }
  return buildCalendarSyncWindow();
}

function buildCalendarViewUrl(
  window: CalendarSyncWindow,
  nextLink?: string,
): string {
  if (nextLink) return nextLink;
  const params = new URLSearchParams({
    startDateTime: window.timeMin.toISOString(),
    endDateTime: window.timeMax.toISOString(),
    $select: "id,subject,start,end,isAllDay,location,attendees",
    $top: String(PAGE_SIZE),
    $orderby: "start/dateTime",
  });
  return `${GRAPH_CALENDAR_VIEW_URL}?${params.toString()}`;
}

interface GraphDateTime {
  dateTime?: string;
  date?: string;
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
  const start = e.start?.dateTime ?? e.start?.date;
  const end = e.end?.dateTime ?? e.end?.date;
  if (!start || !end) return null;
  const attendeeEmails = (e.attendees ?? [])
    .map((a) => a.emailAddress?.address?.toLowerCase().trim())
    .filter((email): email is string => Boolean(email));
  return {
    id: e.id,
    title: e.subject ?? null,
    start,
    end,
    isAllDay: e.isAllDay ?? Boolean(e.start?.date && !e.start?.dateTime),
    location: e.location?.displayName ?? null,
    attendeeEmails,
  };
}

async function callCalendarViewApi(
  accessToken: string,
  url: string,
  fetchImpl: typeof fetch,
): Promise<Response> {
  return fetchImpl(url, {
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
  const window = resolveWindow(input);
  let accessToken = input.accessToken;
  let refreshedAccessToken: string | undefined;
  let refreshedExpiresInSeconds: number | undefined;

  async function load(url: string) {
    let response = await callCalendarViewApi(accessToken, url, fetchImpl);
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
      accessToken = refresh.accessToken;
      refreshedAccessToken = refresh.accessToken;
      refreshedExpiresInSeconds = refresh.expiresInSeconds;
      response = await callCalendarViewApi(accessToken, url, fetchImpl);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Microsoft Graph Calendar ${response.status}: ${text || response.statusText}`,
      );
    }
    return response;
  }

  const events: RawOutlookCalendarEvent[] = [];
  let url: string | undefined = buildCalendarViewUrl(window);

  while (url) {
    const response = await load(url);
    const data = (await response.json()) as {
      value?: GraphEvent[];
      "@odata.nextLink"?: string;
    };
    for (const item of data.value ?? []) {
      const mapped = mapOutlookEvent(item);
      if (mapped) events.push(mapped);
    }
    url = data["@odata.nextLink"];
  }

  return { events, refreshedAccessToken, refreshedExpiresInSeconds };
}

export interface FetchOutlookCalendarEventInput {
  accessToken: string;
  eventId: string;
  fetch?: typeof fetch;
}

export async function fetchOutlookCalendarEvent(
  input: FetchOutlookCalendarEventInput,
): Promise<RawOutlookCalendarEvent | null> {
  const fetchImpl = input.fetch ?? fetch;
  const url =
    `${GRAPH_EVENT_URL}/${encodeURIComponent(input.eventId)}?$select=id,subject,start,end,isAllDay,location,attendees`;
  const response = await fetchImpl(url, {
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      accept: "application/json",
      prefer: 'outlook.timezone="UTC"',
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Microsoft Graph event ${response.status}: ${text || response.statusText}`,
    );
  }
  return mapOutlookEvent((await response.json()) as GraphEvent);
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
