-- Slice 12 — Daily Sleep collection cron.
--
-- Schedules a daily POST to the `sync-sleep` Edge Function for every
-- User at 10 AM UTC. v1 uses a single global slot (UTC); per-User
-- local time is deferred — see the Slice 12 follow-up issue on the
-- timezone decision.
--
-- Hosted Supabase exposes `cron.schedule` (pg_cron) and `net.http_post`
-- (pg_net). The local stack ships both as well. The cron entry calls
-- a SECURITY DEFINER helper that loops the User table and POSTs once
-- per User — debouncing is unnecessary here because a single daily
-- pull is already coarse-grained.
--
-- TODAY: the function it POSTs to (`sync-sleep`) runs a fake fetcher
-- because the HealthKit native module is blocked on Xcode. The cron,
-- the auth path, and the persistence layer are wired up so swapping
-- the fetcher inside the Edge Function flips the loop on for real.

create extension if not exists pg_net with schema extensions;

-- Helper: POST to the sync-sleep Edge Function for every User who
-- has at least one Relationship (i.e. has onboarded). The Edge
-- Function URL is read from a Vault secret to avoid hard-coding the
-- project ref; if the secret is missing, the helper is a no-op so
-- migrations stay safe to apply in any environment.
create function public.dispatch_daily_sleep_sync()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_user record;
begin
  -- Resolve the function endpoint. Stored as a Vault secret named
  -- 'sync_sleep_url' in production; absent locally.
  begin
    select decrypted_secret into v_url
    from vault.decrypted_secrets
    where name = 'sync_sleep_url'
    limit 1;
  exception when others then
    v_url := null;
  end;

  if v_url is null then
    raise notice 'dispatch_daily_sleep_sync: sync_sleep_url secret not set; skipping.';
    return;
  end if;

  for v_user in
    select distinct owner_id from public.relationships
  loop
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('content-type', 'application/json'),
      body := jsonb_build_object(
        'ownerId', v_user.owner_id,
        'asOf', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    );
  end loop;
end;
$$;

-- pg_cron: every day at 10:00 UTC.
select cron.schedule(
  'sleep-daily-sync-10-utc',
  '0 10 * * *',
  'select public.dispatch_daily_sleep_sync();'
);
