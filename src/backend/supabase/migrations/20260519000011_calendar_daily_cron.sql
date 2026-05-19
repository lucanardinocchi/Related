-- Slice 11 (scaffolding) — daily Calendar density collection cron.
-- Calls the `sync-calendar` Edge Function once a day at 10 AM UTC.
--
-- TZ note: the slice brief says "10 AM User-local time". For v1 we fire
-- once at 10 AM UTC and let the Edge Function pull every User in one
-- pass. Per-User-local-time scheduling lands when:
--   (a) the OAuth flow lands (so we know which Users actually have a
--       calendar connected), and
--   (b) we add a `timezone` column to a per-User table.
-- Tracked on issue #12.
--
-- Deploy-time setup (DO once per environment, before applying):
--   1. Enable the `pg_net` extension in the Supabase dashboard so the
--      cron job can fire an HTTP request.
--   2. Store the function URL and service-role key as Vault secrets
--      (or inline them below — they're not user-visible). See:
--      https://supabase.com/docs/guides/database/extensions/pg_net
--   3. Replace the placeholder URL/key in the cron job below with the
--      values from your environment.
--
-- The `pg_cron` extension was already enabled in
-- 20260519000002_pass_scheduler.sql.

-- v1 cron: every day at 10:00 UTC, POST to the sync-calendar function
-- with an empty body. The function reads asOf=now() and iterates over
-- every authenticated User.
--
-- The `net.http_post` call below is the supported pattern in Supabase
-- for "cron triggers an Edge Function". The URL is environment-specific
-- and is filled in at deploy time via a `\set` or `psql -v` invocation.
-- We use a coalesce + current_setting fallback so the migration is
-- idempotent across environments — if the setting isn't present, the
-- cron job is still installed but the http_post is a no-op (we'll see
-- it in the cron logs and know to wire the URL).
select cron.schedule(
  'calendar-daily-sync',
  '0 10 * * *',
  $$
    select
      net.http_post(
        url := coalesce(
          current_setting('app.sync_calendar_url', true),
          'http://host.docker.internal:54321/functions/v1/sync-calendar'
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || coalesce(
            current_setting('app.sync_calendar_token', true),
            ''
          )
        ),
        body := '{}'::jsonb
      );
  $$
);

-- To remove (e.g. when swapping for an OAuth-aware schedule):
--   select cron.unschedule('calendar-daily-sync');
