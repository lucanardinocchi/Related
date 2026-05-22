-- Push notification subscriptions for Google Calendar watch channels and
-- Microsoft Graph calendar subscriptions.

create table if not exists public.calendar_sync_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google', 'outlook')),
  channel_id text not null,
  resource_id text,
  sync_token text,
  client_state text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, provider)
);

create index if not exists calendar_sync_subscriptions_expires_at_idx
  on public.calendar_sync_subscriptions (expires_at);

alter table public.calendar_sync_subscriptions enable row level security;

create policy calendar_sync_subscriptions_select_own
  on public.calendar_sync_subscriptions
  for select
  using (auth.uid() = owner_id);

-- Edge Functions use service role for writes.

-- Renew subscriptions daily (before typical 3–7 day expiries).
select cron.schedule(
  'calendar-renew-subscriptions',
  '0 9 * * *',
  $$
    select
      net.http_post(
        url := coalesce(
          current_setting('app.calendar_renew_url', true),
          'http://host.docker.internal:54321/functions/v1/calendar-renew-subscriptions'
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
