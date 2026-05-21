import {
  fetchOutlookCalendarEvents,
  mapOutlookEvent,
  refreshOutlookAccessToken,
} from "./OutlookCalendarFetcher";

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  return jest.fn().mockImplementation(handler);
}

describe("fetchOutlookCalendarEvents", () => {
  it("calls Microsoft Graph calendarView with start/end window and Bearer token", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = mockFetch(async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ value: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await fetchOutlookCalendarEvents({
      accessToken: "at-1",
      asOf: new Date("2026-05-19T00:00:00Z"),
      fetch: fetcher,
    });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.host).toBe("graph.microsoft.com");
    expect(url.pathname).toBe("/v1.0/me/calendarView");
    expect(url.searchParams.get("startDateTime")).toBe("2026-05-19T00:00:00.000Z");
    expect(url.searchParams.get("endDateTime")).toBe("2026-05-26T00:00:00.000Z");
    expect(
      (calls[0].init?.headers as Record<string, string>)?.authorization,
    ).toBe("Bearer at-1");
  });

  it("maps Graph events to RawOutlookCalendarEvent shape", () => {
    const event = mapOutlookEvent({
      id: "evt-1",
      subject: "Team sync",
      start: { dateTime: "2026-05-21T15:00:00Z", timeZone: "UTC" },
      end: { dateTime: "2026-05-21T16:00:00Z", timeZone: "UTC" },
      isAllDay: false,
      location: { displayName: "Room A" },
      attendees: [{ emailAddress: { address: "Sam@Example.com" } }],
    });

    expect(event).toEqual({
      id: "evt-1",
      title: "Team sync",
      start: "2026-05-21T15:00:00Z",
      end: "2026-05-21T16:00:00Z",
      isAllDay: false,
      location: "Room A",
      attendeeEmails: ["sam@example.com"],
    });
  });

  it("refreshes token on 401 and retries", async () => {
    let callCount = 0;
    const fetcher = mockFetch(async (url) => {
      callCount += 1;
      if (url.includes("oauth2/v2.0/token")) {
        return new Response(
          JSON.stringify({ access_token: "at-new", expires_in: 3600 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (callCount === 1) {
        return new Response("unauthorized", { status: 401 });
      }
      return new Response(JSON.stringify({ value: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const result = await fetchOutlookCalendarEvents({
      accessToken: "at-old",
      refreshToken: "rt-1",
      clientId: "cid",
      clientSecret: "secret",
      asOf: new Date("2026-05-19T00:00:00Z"),
      fetch: fetcher,
    });

    expect(result.refreshedAccessToken).toBe("at-new");
    expect(result.events).toEqual([]);
  });
});

describe("refreshOutlookAccessToken", () => {
  it("POSTs to Microsoft token endpoint with refresh_token grant", async () => {
    const calls: { url: string; body?: string }[] = [];
    const fetcher = mockFetch(async (url, init) => {
      calls.push({ url, body: init?.body as string });
      return new Response(
        JSON.stringify({ access_token: "at-2", expires_in: 7200 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const result = await refreshOutlookAccessToken({
      refreshToken: "rt-1",
      clientId: "cid",
      clientSecret: "secret",
      fetch: fetcher,
    });

    expect(calls[0].url).toContain("login.microsoftonline.com");
    expect(calls[0].body).toContain("grant_type=refresh_token");
    expect(result.accessToken).toBe("at-2");
    expect(result.expiresInSeconds).toBe(7200);
  });
});
