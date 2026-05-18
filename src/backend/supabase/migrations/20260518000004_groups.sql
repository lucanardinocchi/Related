-- Group: a named collection of Contacts (e.g., "college friends"). First-
-- class entity per ADR-0004 — the User has a Relationship to a Group the
-- same way they have one to a Contact, with its own Open Threads, Candidate
-- Set, and Interaction history. Membership is User-curated, not inferred
-- (see src/shared/CONTEXT.md). Slice 6 lands the table; the Contact ↔ Group
-- join and the relationships polymorphic widening land in follow-up
-- migrations in this slice.
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index groups_owner_id_idx on public.groups (owner_id);

alter table public.groups enable row level security;

create policy groups_select_own
  on public.groups
  for select
  using (owner_id = auth.uid());

create policy groups_insert_own
  on public.groups
  for insert
  with check (owner_id = auth.uid());
