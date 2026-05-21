-- Calendar redesign per ADR-0010: unified editable Event model. The
-- /calendar page now reads from this table exclusively. Google-sourced
-- rows materialize here from the sync-calendar Edge Function (source =
-- 'google', external_event_id set); user-created rows live alongside
-- (source = 'manual', external_event_id null). The Google sync only
-- overwrites Google-owned columns (title, start, end, is_all_day,
-- location) — user enrichment (aim, required_prep, status, type) is
-- preserved across syncs.
--
-- inferred_signal_calendar stays in place: it remains the input to
-- signals/calendarDensity for the agent's density signal. Only the
-- user-facing /calendar UI moves off it.

create type public.event_type as enum
  ('work', 'meeting', 'uni', 'personal', 'activity');

create type public.event_status as enum
  ('planned', 'occurred', 'cancelled', 'missed');

create type public.event_source as enum
  ('manual', 'google');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text,
  start timestamptz not null,
  "end" timestamptz not null,
  is_all_day boolean not null default false,
  location text,
  aim text,
  required_prep text,
  status public.event_status not null default 'planned',
  type public.event_type not null default 'meeting',
  source public.event_source not null default 'manual',
  external_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Upsert key for the Google sync. Partial unique so manual events
  -- (external_event_id null) don't collide on the index.
  constraint events_google_id_unique unique (owner_id, external_event_id)
);

create index events_owner_start_idx on public.events (owner_id, start);

alter table public.events enable row level security;

create policy events_select_own
  on public.events for select using (owner_id = auth.uid());
create policy events_insert_own
  on public.events for insert with check (owner_id = auth.uid());
create policy events_update_own
  on public.events for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy events_delete_own
  on public.events for delete using (owner_id = auth.uid());

-- Attendees: link an Event to existing Contacts. The Google sync maps
-- attendee emails to contacts.email at sync time; unmatched emails are
-- dropped in v1.
create table public.event_attendees (
  event_id uuid not null references public.events (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  primary key (event_id, contact_id)
);

alter table public.event_attendees enable row level security;

-- RLS via parent event ownership — there's no owner_id column here.
create policy event_attendees_select_own
  on public.event_attendees for select
  using (
    exists (
      select 1 from public.events e
      where e.id = event_id and e.owner_id = auth.uid()
    )
  );
create policy event_attendees_insert_own
  on public.event_attendees for insert
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_id and e.owner_id = auth.uid()
    )
    and exists (
      select 1 from public.contacts c
      where c.id = contact_id and c.owner_id = auth.uid()
    )
  );
create policy event_attendees_delete_own
  on public.event_attendees for delete
  using (
    exists (
      select 1 from public.events e
      where e.id = event_id and e.owner_id = auth.uid()
    )
  );
