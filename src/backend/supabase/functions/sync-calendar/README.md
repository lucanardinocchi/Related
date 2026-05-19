# sync-calendar

Daily Edge Function that pulls each User's 7-day forward calendar window
and writes it to `inferred_signal_calendar`. Invoked by `pg_cron` at
10 AM UTC (see `20260519000010_calendar_daily_cron.sql`) and also
callable on demand (future "Sync now" button in the You/settings screen).

## Today: fake fetcher

The function ships with an inlined fake event source so the daily loop
exists end-to-end before Google Calendar OAuth is provisioned. Every
invocation logs:

```
[sync-calendar] FAKE FETCHER — replace with Google OAuth fetcher
```

This is intentional. It's how we audit when the swap finally happens.

## Deploy

```sh
supabase functions deploy sync-calendar
```

The function reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from
the Edge Runtime env (auto-injected by Supabase). It also reads
`CALENDAR_PROVIDER` (defaults to `"fake"`) which today is informational —
when the OAuth swap lands, this gates which fetcher implementation is
used.

## Future OAuth swap

When Google Calendar OAuth is provisioned, replace
`fetchCalendarEvents()` in `index.ts` with a function that:

1. Reads the User's stored OAuth refresh token from a (yet-to-be-created)
   `user_calendar_connections` table.
2. Exchanges it for an access token.
3. Calls `GET /calendar/v3/calendars/primary/events` with
   `timeMin=asOf&timeMax=asOf+7d&singleEvents=true`.
4. Maps the response to `RawCalendarEvent[]`.

The rest of the function (collector logic, summary shape, error
handling, cron wiring) does NOT need to change.

Optional: set `CALENDAR_PROVIDER=google` to make the warning log go
silent once the real fetcher is wired.

## Request body

Both fields are optional. When called from `pg_cron` the body is empty
and the function iterates over every authenticated User.

```json
{ "asOf": "2026-05-19T10:00:00Z", "ownerId": "uuid-or-omit" }
```

## Response

```json
{
  "provider": "fake",
  "summaries": [
    { "ownerId": "...", "eventsWritten": 3, "windowEnd": "..." }
  ]
}
```

## Why the function inlines the collector logic

The shared `@related/shared` package houses the canonical
`runDailyCalendarCollection` driver. Edge Functions can import shared
TypeScript via Deno's NPM specifiers, but `@related/shared` isn't on npm
yet — so this function mirrors the collector's persistence logic
locally, same trade-off as `engaged-pass/index.ts`. The two
implementations are kept in sync by hand; if the
`inferred_signal_calendar` schema changes, change both.
