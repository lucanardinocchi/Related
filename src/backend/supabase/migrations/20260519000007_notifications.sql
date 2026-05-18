-- Slice 15 — Notifications. Two tables:
--   push_subscriptions: one row per (User, device). Token is upserted on
--     each app launch so a re-installed app rotates the token cleanly.
--   notification_preferences: singleton-per-User. Quiet hours are stored
--     as text time-of-day strings (HH:MM, 24h) without a date or
--     timezone — the dispatcher interprets them in the User's local TZ
--     at dispatch time (TZ tracking arrives with the Calendar OAuth
--     slice; for now the dispatcher treats them as UTC).
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  platform text not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint push_subscriptions_owner_token_unique unique (owner_id, token),
  constraint push_subscriptions_platform_valid
    check (platform in ('ios', 'android', 'web'))
);

create index push_subscriptions_owner_id_idx on public.push_subscriptions (owner_id);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select_own
  on public.push_subscriptions for select using (owner_id = auth.uid());
create policy push_subscriptions_insert_own
  on public.push_subscriptions for insert with check (owner_id = auth.uid());
create policy push_subscriptions_update_own
  on public.push_subscriptions for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy push_subscriptions_delete_own
  on public.push_subscriptions for delete using (owner_id = auth.uid());

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  enabled boolean not null default true,
  quiet_hours_start text,
  quiet_hours_end text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint notification_preferences_singleton unique (owner_id)
);

alter table public.notification_preferences enable row level security;

create policy notification_preferences_select_own
  on public.notification_preferences for select using (owner_id = auth.uid());
create policy notification_preferences_insert_own
  on public.notification_preferences for insert with check (owner_id = auth.uid());
create policy notification_preferences_update_own
  on public.notification_preferences for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create trigger notification_preferences_touch_updated_at
  before update on public.notification_preferences
  for each row execute function public.touch_updated_at();
