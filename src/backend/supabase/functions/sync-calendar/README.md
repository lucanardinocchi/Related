# sync-calendar

Daily Edge Function that pulls each User's 7-day forward calendar window from Google Calendar and writes it to `inferred_signal_calendar`. Invoked by `pg_cron` at 10 AM UTC (see `20260519000011_calendar_daily_cron.sql`) and also callable on demand with `{ ownerId }` for a single-User sync (e.g. from a future "Sync now" button).

Per ADR-0006, the function iterates over every User who has a row in `user_provider_tokens` for `provider='google'`. Users without a Google integration are skipped silently.

## Deploy

```sh
supabase secrets set GOOGLE_OAUTH_CLIENT_ID=...
supabase secrets set GOOGLE_OAUTH_CLIENT_SECRET=...
supabase functions deploy sync-calendar
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the Edge Runtime.

The `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` are the **same Google Cloud OAuth client** you configured in Supabase Auth → Providers → Google during Slice B. They're needed here because Supabase Auth gives us the refresh token but doesn't refresh on our behalf for non-auth API calls.

## Token-refresh behaviour

On a 401 from the Calendar API, the function:

1. Reads the User's `refresh_token` from `user_provider_tokens`
2. Calls `POST oauth2.googleapis.com/token` with `grant_type=refresh_token`
3. Updates `user_provider_tokens.access_token` + `expires_at` with the new token
4. Retries the Calendar call once

If the refresh fails (revoked, expired refresh token, etc.) the function returns `{ status: "needs_reconsent" }` in that User's summary so the caller (future UI) can prompt re-consent.

## Request body

Both fields are optional. When called from `pg_cron` the body is empty and the function syncs every connected User.

```json
{ "asOf": "2026-05-19T10:00:00Z", "ownerId": "uuid-or-omit" }
```

## Response

```json
{
  "provider": "google",
  "summaries": [
    { "ownerId": "...", "eventsWritten": 12, "windowEnd": "...", "status": "ok" },
    { "ownerId": "...", "eventsWritten": 0, "status": "needs_reconsent" }
  ]
}
```

## Why the function inlines the fetcher logic

The canonical Google Calendar fetcher lives at `src/shared/src/integrations/google/GoogleCalendarFetcher.ts` and is unit-tested there. Edge Functions could import it via Deno's NPM specifiers if `@related/shared` were on npm — it isn't, so this function mirrors the fetcher locally. Same trade-off as `ambient-pass/index.ts`. The two implementations are kept in sync by hand; if the Google response mapping changes, change both.
