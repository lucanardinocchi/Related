-- ADR-0009 amendment 2026-05-21 — Relationship Context. A per-Relationship
-- narrative singleton written by the Extraction Pass and read by the next
-- Agent Pass. One row per Relationship (Contact or Group, since
-- Relationship.target is polymorphic per ADR-0004). The Extraction Pass
-- replaces the content wholly each run with the same merge contract as
-- situational_state: preserve still-true content, remove contradicted, add
-- new.
--
-- Narrative state, NOT action state. This table is intentionally outside
-- the Candidate Action invariant — describing a Relationship is not acting
-- on the world. Logging Interactions / opening Open Threads / changing
-- role+cadence remain Candidate-gated.
create table public.relationship_context (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  relationship_id uuid not null,
  content text not null,
  -- The Chat that produced the latest write. Nullable so the User can edit
  -- directly without inventing a source. On chat delete, keep the content
  -- but null the source (set null, not cascade).
  source_chat_id uuid references public.chats (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint relationship_context_singleton unique (relationship_id),

  foreign key (relationship_id, owner_id)
    references public.relationships (id, owner_id) on delete cascade
);

create index relationship_context_owner_id_idx
  on public.relationship_context (owner_id);

alter table public.relationship_context enable row level security;

create policy relationship_context_select_own
  on public.relationship_context for select
  using (owner_id = auth.uid());

create policy relationship_context_insert_own
  on public.relationship_context for insert
  with check (owner_id = auth.uid());

create policy relationship_context_update_own
  on public.relationship_context for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy relationship_context_delete_own
  on public.relationship_context for delete
  using (owner_id = auth.uid());

-- Same touch trigger pattern as situational_state — Salience is computed
-- from updated_at so we want every UPDATE to bump it, even if callers
-- forget to set it explicitly.
create trigger relationship_context_touch_updated_at
  before update on public.relationship_context
  for each row execute function public.touch_updated_at();
