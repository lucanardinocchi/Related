-- Operator Profile: the fifth User Context flavour. Captures what the User
-- is positioned to offer — domains of expertise, kinds of help they're
-- willing to give. Read by the Ambient Intelligence agent on every Pass
-- to filter Candidate Actions by capability fit ("only propose actions
-- that route through one of these strengths, or DoNothing").
--
-- Shape mirrors goals_and_values: multi-row, User-authored only, one row
-- per declared strength. The agent never proposes new Strengths — the
-- write pattern is User-only via the /context page.

create table public.operator_strengths (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index operator_strengths_owner_id_idx on public.operator_strengths (owner_id);

alter table public.operator_strengths enable row level security;

create policy operator_strengths_select_own
  on public.operator_strengths for select using (owner_id = auth.uid());
create policy operator_strengths_insert_own
  on public.operator_strengths for insert with check (owner_id = auth.uid());
create policy operator_strengths_update_own
  on public.operator_strengths for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy operator_strengths_delete_own
  on public.operator_strengths for delete using (owner_id = auth.uid());

create trigger operator_strengths_touch_updated_at
  before update on public.operator_strengths
  for each row execute function public.touch_updated_at();
