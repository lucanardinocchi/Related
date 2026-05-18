-- Slice 11 — Inferred Signals: Calendar density. Raw events pulled once
-- daily at 10 AM User-local time (Slice 11 schedules via pg_cron in UTC
-- for now; per-User timezone scheduling lands when the OAuth path lands).
-- The 7-day forward window is replaced each pull, so the upsert key is
-- (owner_id, event_id) — re-pulling the same event updates it in place
-- and a vanished event is deleted by the collector.
create table public.inferred_signal_calendar (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  event_id text not null,
  title text,
  start timestamptz not null,
  "end" timestamptz not null,
  is_all_day boolean not null default false,
  fetched_at timestamptz not null default now(),

  constraint inferred_signal_calendar_owner_event_unique
    unique (owner_id, event_id)
);

create index inferred_signal_calendar_owner_id_idx
  on public.inferred_signal_calendar (owner_id);
create index inferred_signal_calendar_owner_start_idx
  on public.inferred_signal_calendar (owner_id, start);

alter table public.inferred_signal_calendar enable row level security;

create policy inferred_signal_calendar_select_own
  on public.inferred_signal_calendar for select using (owner_id = auth.uid());
create policy inferred_signal_calendar_insert_own
  on public.inferred_signal_calendar for insert with check (owner_id = auth.uid());
create policy inferred_signal_calendar_update_own
  on public.inferred_signal_calendar for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy inferred_signal_calendar_delete_own
  on public.inferred_signal_calendar for delete using (owner_id = auth.uid());
