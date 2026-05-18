-- Slice 10 — User Context flavours: Goals & Values + Situational State per
-- ADR-0002. Two of the four flavours land in this slice; Transient Intent
-- (Slice 14) and Inferred Signals (Slices 11-12) follow.
--
-- Goals & Values: User-authored only. The settings UI is the sole writer
-- (the agent never proposes new Goals — that's a glossary invariant).
--
-- Situational State: medium-term narrative (e.g. "Just moved to Sydney").
-- One row per User; updates are upserts. Editable by the User AND silently
-- writable by the Engaged Pass when the User mentions a life change in
-- conversation. Recency of `updated_at` drives the flavour's Salience at
-- Pass time, so we trigger a touch on every UPDATE rather than relying on
-- callers to set it.

create table public.goals_and_values (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index goals_and_values_owner_id_idx on public.goals_and_values (owner_id);

alter table public.goals_and_values enable row level security;

create policy goals_and_values_select_own
  on public.goals_and_values for select using (owner_id = auth.uid());
create policy goals_and_values_insert_own
  on public.goals_and_values for insert with check (owner_id = auth.uid());
create policy goals_and_values_update_own
  on public.goals_and_values for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy goals_and_values_delete_own
  on public.goals_and_values for delete using (owner_id = auth.uid());

create table public.situational_state (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint situational_state_singleton unique (owner_id)
);

alter table public.situational_state enable row level security;

create policy situational_state_select_own
  on public.situational_state for select using (owner_id = auth.uid());
create policy situational_state_insert_own
  on public.situational_state for insert with check (owner_id = auth.uid());
create policy situational_state_update_own
  on public.situational_state for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy situational_state_delete_own
  on public.situational_state for delete using (owner_id = auth.uid());

-- Touch updated_at on every UPDATE so Salience can be computed off it.
create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger situational_state_touch_updated_at
  before update on public.situational_state
  for each row execute function public.touch_updated_at();

create trigger goals_and_values_touch_updated_at
  before update on public.goals_and_values
  for each row execute function public.touch_updated_at();
