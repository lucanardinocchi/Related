-- Open Thread: a commitment, owed reply, or unresolved item attached to one
-- or more Relationships. First-class — the agent loop reasons over open
-- threads on every Pass (see src/shared/CONTEXT.md). Direction is binary;
-- closing one Thread closes it for every linked Relationship at once
-- (ADR-0004 corollary: one Thread can span multiple Relationships).
create table public.open_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  description text not null,
  direction text not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,

  constraint open_threads_direction_valid
    check (direction in ('me_owes_them', 'they_owe_me')),

  -- Composite uniqueness so the join table can FK to (id, owner_id) and
  -- enforce owner consistency at insert time. Logically redundant given
  -- the PK on id, but required by Postgres for the composite FK target.
  constraint open_threads_id_owner_unique unique (id, owner_id)
);

create index open_threads_owner_id_idx on public.open_threads (owner_id);
create index open_threads_owner_open_created_idx
  on public.open_threads (owner_id, created_at)
  where closed_at is null;
create index open_threads_owner_closed_at_idx
  on public.open_threads (owner_id, closed_at)
  where closed_at is not null;

-- Same composite uniqueness on relationships so the join table's FK can
-- enforce that a linked relationship belongs to the same owner as the
-- thread. (PK on id makes the second column redundant — Postgres still
-- needs the explicit unique constraint to be a valid FK target.)
alter table public.relationships
  add constraint relationships_id_owner_unique unique (id, owner_id);

create table public.open_thread_relationships (
  open_thread_id uuid not null,
  relationship_id uuid not null,
  owner_id uuid not null,

  primary key (open_thread_id, relationship_id),

  -- Composite FKs guarantee the join row's owner matches both the
  -- thread's owner and the relationship's owner. With these, an RLS-
  -- evading cross-user link attempt fails at FK validation rather than
  -- needing a separate trigger.
  foreign key (open_thread_id, owner_id)
    references public.open_threads (id, owner_id) on delete cascade,
  foreign key (relationship_id, owner_id)
    references public.relationships (id, owner_id) on delete cascade
);

create index open_thread_relationships_relationship_id_idx
  on public.open_thread_relationships (relationship_id);
create index open_thread_relationships_owner_id_idx
  on public.open_thread_relationships (owner_id);

alter table public.open_threads enable row level security;
alter table public.open_thread_relationships enable row level security;

create policy open_threads_select_own
  on public.open_threads
  for select
  using (owner_id = auth.uid());

create policy open_threads_insert_own
  on public.open_threads
  for insert
  with check (owner_id = auth.uid());

create policy open_threads_update_own
  on public.open_threads
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy open_thread_relationships_select_own
  on public.open_thread_relationships
  for select
  using (owner_id = auth.uid());

create policy open_thread_relationships_insert_own
  on public.open_thread_relationships
  for insert
  with check (owner_id = auth.uid());

-- create_open_thread: insert the thread and its links atomically. Runs as
-- SECURITY INVOKER so RLS WITH CHECK and the composite FK both apply with
-- the caller's identity — a User cannot create a thread linked to another
-- User's Relationship (the FK to (relationship_id, owner_id) fails).
create function public.create_open_thread(
  p_description text,
  p_direction text,
  p_relationship_ids uuid[]
) returns uuid
language plpgsql
as $$
declare
  v_owner uuid := auth.uid();
  v_id uuid;
  v_rel uuid;
begin
  if v_owner is null then
    raise exception 'unauthenticated';
  end if;
  if p_relationship_ids is null or cardinality(p_relationship_ids) = 0 then
    raise exception 'at least one relationship required';
  end if;

  insert into public.open_threads (owner_id, description, direction)
  values (v_owner, p_description, p_direction)
  returning id into v_id;

  foreach v_rel in array p_relationship_ids loop
    insert into public.open_thread_relationships
      (open_thread_id, relationship_id, owner_id)
    values (v_id, v_rel, v_owner);
  end loop;

  return v_id;
end;
$$;
