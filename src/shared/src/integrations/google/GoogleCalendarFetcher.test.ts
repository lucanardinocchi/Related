import {
  fetchGoogleCalendarEvents,
  refreshGoogleAccessToken,
} from "./GoogleCalendarFetcher";

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  return jest.fn().mockImplementation(handler);
}

describe("fetchGoogleCalendarEvents", () => {
  it("calls the Calendar v3 events endpoint with timeMin=asOf, timeMax=asOf+7d, Bearer token, singleEvents=true", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = mockFetch(async (url, init) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({ items: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    await fetchGoogleCalendarEvents({
      accessToken: "at-1",
      asOf: new Date("2026-05-19T00:00:00Z"),
      fetch: fetcher,
    });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.host).toBe("www.googleapis.com");
    expect(url.pathname).toBe("/calendar/v3/calendars/primary/events");
    expect(url.searchParams.get("timeMin")).toBe("2026-05-19T00:00:00.000Z");
    expect(url.searchParams.get("timeMax")).toBe("2026-05-26T00:00:00.000Z");
    expect(url.searchParams.get("singleEvents")).toBe("true");
    expect(url.searchParams.get("orderBy")).toBe("startTime");
    expect((calls[0].init?.headers as Record<string, string>)?.authorization).toBe(
      "Bearer at-1",
    );
  });

  it("maps Google's event response to RawCalendarEvent shape (id, title, start, end, isAllDay)", async () => {
    const fetcher = mockFetch(async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: "evt-1",
              summary: "Coffee with Sam",
              start: { dateTime: "2026-05-21T15:00:00Z" },
              end: { dateTime: "2026-05-21T16:00:00Z" },
            },
            {
              id: "evt-2",
              summary: "All-day birthday",
              start: { date: "2026-05-23" },
              end: { date: "2026-05-24" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await fetchGoogleCalendarEvents({
      accessToken: "at-1",
      asOf: new Date("2026-05-19T00:00:00Z"),
      fetch: fetcher,
    });

    expect(result.events).toEqual([
      {
        id: "evt-1",
        title: "Coffee with Sam",
        start: "2026-05-21T15:00:00Z",
        end: "2026-05-21T16:00:00Z",
        isAllDay: false,
        location: null,
        attendeeEmails: [],
      },
      {
        id: "evt-2",
        title: "All-day birthday",
        start: "2026-05-23",
        end: "2026-05-24",
        isAllDay: true,
        location: null,
        attendeeEmails: [],
      },
    ]);
    expect(result.refreshedAccessToken).toBeUndefined();
  });

  it("on 401: refreshes the access token + retries once, and surfaces the new token", async () => {
    let calls = 0;
    const fetcher = mockFetch(async (url, init) => {
      calls += 1;
      if (calls === 1) {
        // First call — return 401 from Calendar API
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
        });
      }
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "at-refreshed",
            expires_in: 3600,
            token_type: "Bearer",
          }),
          { status: 200 },
        );
      }
      // Retry with new token
      expect((init?.headers as Record<string, string>)?.authorization).toBe(
        "Bearer at-refreshed",
      );
      return new Response(
        JSON.stringify({ items: [] }),
        { status: 200 },
      );
    });

    const result = await fetchGoogleCalendarEvents({
      accessToken: "at-stale",
      refreshToken: "rt-1",
      clientId: "client-id",
      clientSecret: "client-secret",
      asOf: new Date("2026-05-19T00:00:00Z"),
      fetch: fetcher,
    });

    expect(result.refreshedAccessToken).toBe("at-refreshed");
    expect(result.events).toEqual([]);
  });

  it("throws if 401 and no refresh token available (User needs to re-consent)", async () => {
    const fetcher = mockFetch(async () =>
      new Response("unauthorized", { status: 401 }),
    );
    await expect(
      fetchGoogleCalendarEvents({
        accessToken: "at-stale",
        asOf: new Date("2026-05-19T00:00:00Z"),
        fetch: fetcher,
      }),
    ).rejects.toThrow(/reconsent|refresh/i);
  });
});

describe("refreshGoogleAccessToken", () => {
  it("POSTs to oauth2.googleapis.com/token with grant_type=refresh_token, returns the new access token + expiry", async () => {
    let captured: { url?: string; init?: RequestInit } = {};
    const fetcher = mockFetch(async (url, init) => {
      captured = { url, init };
      return new Response(
        JSON.stringify({
          access_token: "at-new",
          expires_in: 3500,
          token_type: "Bearer",
        }),
        { status: 200 },
      );
    });

    const got = await refreshGoogleAccessToken({
      refreshToken: "rt-1",
      clientId: "cid",
      clientSecret: "csec",
      fetch: fetcher,
    });

    expect(captured.url).toMatch(/oauth2\.googleapis\.com\/token/);
    expect(captured.init?.method).toBe("POST");
    const body = String(captured.init?.body ?? "");
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=rt-1");
    expect(body).toContain("client_id=cid");
    expect(body).toContain("client_secret=csec");

    expect(got.accessToken).toBe("at-new");
    expect(got.expiresInSeconds).toBe(3500);
  });
});
