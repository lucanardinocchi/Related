-- Slice 12 — Inferred Signal #2: Sleep via HealthKit (iOS-only in v1).
-- Same shape as the calendar signal: raw records over the relevant window,
-- replaced on each daily pull. Window for sleep is the last 3 days per the
-- PRD; the builder summarises into a Pass-prompt-shaped signal with focus
-- on the next 48 hours of energy / social capacity.
create table public.inferred_signal_sleep (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  record_id text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_minutes integer not null,
  quality text,
  fetched_at timestamptz not null default now(),

  constraint inferred_signal_sleep_owner_record_unique
    unique (owner_id, record_id)
);

create index inferred_signal_sleep_owner_id_idx
  on public.inferred_signal_sleep (owner_id);
create index inferred_signal_sleep_owner_started_idx
  on public.inferred_signal_sleep (owner_id, started_at);

alter table public.inferred_signal_sleep enable row level security;

create policy inferred_signal_sleep_select_own
  on public.inferred_signal_sleep for select using (owner_id = auth.uid());
create policy inferred_signal_sleep_insert_own
  on public.inferred_signal_sleep for insert with check (owner_id = auth.uid());
create policy inferred_signal_sleep_update_own
  on public.inferred_signal_sleep for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy inferred_signal_sleep_delete_own
  on public.inferred_signal_sleep for delete using (owner_id = auth.uid());
