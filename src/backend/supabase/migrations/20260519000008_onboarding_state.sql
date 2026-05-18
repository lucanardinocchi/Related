-- Slice 16 — Onboarding state. Singleton-per-User row tracks which steps
-- the User has completed so a half-finished onboarding resumes at the
-- next incomplete step on re-launch. Existing Users created before this
-- slice landed have NO row, which the AuthGate interprets as "already
-- past onboarding" (the slice brief explicitly requires that).
create table public.onboarding_state (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- Which steps the User has completed or explicitly skipped (the agent
  -- treats both as "done with that step"). Schema is permissive — adding
  -- a step in a later slice doesn't require a migration.
  completed_steps text[] not null default '{}',
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint onboarding_state_singleton unique (owner_id)
);

alter table public.onboarding_state enable row level security;

create policy onboarding_state_select_own
  on public.onboarding_state for select using (owner_id = auth.uid());
create policy onboarding_state_insert_own
  on public.onboarding_state for insert with check (owner_id = auth.uid());
create policy onboarding_state_update_own
  on public.onboarding_state for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create trigger onboarding_state_touch_updated_at
  before update on public.onboarding_state
  for each row execute function public.touch_updated_at();
