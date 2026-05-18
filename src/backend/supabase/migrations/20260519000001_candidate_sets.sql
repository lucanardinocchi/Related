-- Slice 7 — Candidate Sets + Candidate Actions. The persistence layer for
-- the Ambient Intelligence loop (ADR-0001). One CandidateSet per Pass per
-- Relationship; the previous set is replaced (with strong continuity bias
-- in the agent's prompt) on the next Pass. Decisions are recorded as
-- decision_state transitions on the individual CandidateAction.
create table public.candidate_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  relationship_id uuid not null,
  mode text not null,
  created_at timestamptz not null default now(),

  constraint candidate_sets_mode_valid
    check (mode in ('baseline', 'triggered', 'engaged')),

  -- Composite uniqueness so the action table's FK can pin owner consistency.
  constraint candidate_sets_id_owner_unique unique (id, owner_id),

  foreign key (relationship_id, owner_id)
    references public.relationships (id, owner_id) on delete cascade
);

create index candidate_sets_owner_id_idx on public.candidate_sets (owner_id);
create index candidate_sets_relationship_id_idx
  on public.candidate_sets (relationship_id);
create index candidate_sets_owner_relationship_created_idx
  on public.candidate_sets (owner_id, relationship_id, created_at desc);

create table public.candidate_actions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  candidate_set_id uuid not null,
  type text not null,
  payload jsonb,
  why text,
  decision_state text not null default 'pending',
  decided_at timestamptz,
  created_at timestamptz not null default now(),

  constraint candidate_actions_decision_state_valid
    check (decision_state in ('pending', 'picked', 'declined', 'ignored')),

  foreign key (candidate_set_id, owner_id)
    references public.candidate_sets (id, owner_id) on delete cascade
);

create index candidate_actions_owner_id_idx on public.candidate_actions (owner_id);
create index candidate_actions_set_id_idx
  on public.candidate_actions (candidate_set_id);

alter table public.candidate_sets enable row level security;
alter table public.candidate_actions enable row level security;

create policy candidate_sets_select_own
  on public.candidate_sets
  for select using (owner_id = auth.uid());
create policy candidate_sets_insert_own
  on public.candidate_sets
  for insert with check (owner_id = auth.uid());
create policy candidate_sets_delete_own
  on public.candidate_sets
  for delete using (owner_id = auth.uid());

create policy candidate_actions_select_own
  on public.candidate_actions
  for select using (owner_id = auth.uid());
create policy candidate_actions_insert_own
  on public.candidate_actions
  for insert with check (owner_id = auth.uid());
create policy candidate_actions_update_own
  on public.candidate_actions
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
