-- Calendar v2: status taxonomy expansion + per-event category +
-- local overlay for external (Google) events.
--
-- Three changes:
--   1. Extend interactions.status to allow 'attended' and 'cancelled'
--      alongside the original 'planned' / 'occurred' / 'missed'. The
--      Calendar UI treats 'occurred' and 'attended' as synonyms in the
--      display while letting the User assign 'attended' explicitly to
--      past entries from the new status picker.
--   2. Add interactions.category — one of work / meeting / activity /
--      personal / errands. Defaults to 'personal' for back-fill of
--      pre-existing rows; new rows still default to 'personal' if the
--      caller doesn't specify one.
--   3. Create inferred_signal_calendar_overlay — a local sidecar table
--      keyed by (owner_id, event_id) that lets the User assign a status
--      and category to external Google events without mutating the
--      upstream calendar.

alter table public.interactions
  drop constraint interactions_status_valid;

alter table public.interactions
  add constraint interactions_status_valid
  check (status in ('planned', 'occurred', 'attended', 'missed', 'cancelled'));

alter table public.interactions
  add column category text not null default 'personal';

alter table public.interactions
  add constraint interactions_category_valid
  check (category in ('work', 'meeting', 'activity', 'personal', 'errands'));

-- Sidecar for external (Google) events. Joins to
-- inferred_signal_calendar via (owner_id, event_id). The overlay row is
-- created on first assignment; absence means "no User-set status/category".
create table public.inferred_signal_calendar_overlay (
  owner_id uuid not null references auth.users (id) on delete cascade,
  event_id text not null,
  status text,
  category text,
  updated_at timestamptz not null default now(),

  primary key (owner_id, event_id),

  constraint inferred_signal_calendar_overlay_status_valid
    check (status is null or status in ('planned', 'occurred', 'attended', 'missed', 'cancelled')),
  constraint inferred_signal_calendar_overlay_category_valid
    check (category is null or category in ('work', 'meeting', 'activity', 'personal', 'errands'))
);

create index inferred_signal_calendar_overlay_owner_id_idx
  on public.inferred_signal_calendar_overlay (owner_id);

alter table public.inferred_signal_calendar_overlay enable row level security;

create policy inferred_signal_calendar_overlay_select_own
  on public.inferred_signal_calendar_overlay for select
  using (owner_id = auth.uid());

create policy inferred_signal_calendar_overlay_insert_own
  on public.inferred_signal_calendar_overlay for insert
  with check (owner_id = auth.uid());

create policy inferred_signal_calendar_overlay_update_own
  on public.inferred_signal_calendar_overlay for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy inferred_signal_calendar_overlay_delete_own
  on public.inferred_signal_calendar_overlay for delete
  using (owner_id = auth.uid());
