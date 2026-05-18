-- Interaction: a single moment of contact between the User and one or more
-- Contacts. Past and future are the same shape; the difference is `time` and
-- `status`. The Calendar view is a filter over Interactions, not its own
-- entity (see src/shared/CONTEXT.md). Group-targeted Interactions arrive in
-- Slice 6 — for now, Contact-only.
create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  time timestamptz not null,
  kind text not null,
  notes text,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint interactions_status_valid
    check (status in ('planned', 'occurred', 'missed')),

  -- Composite uniqueness so the join table's FK can pin owner consistency at
  -- insert time. Redundant given the PK on id, but Postgres requires the
  -- explicit unique constraint to be a valid FK target.
  constraint interactions_id_owner_unique unique (id, owner_id)
);

create index interactions_owner_id_idx on public.interactions (owner_id);
create index interactions_owner_time_idx on public.interactions (owner_id, time);

-- Mirror the composite uniqueness on contacts so the join FK can enforce that
-- a linked Contact belongs to the same owner as the Interaction.
alter table public.contacts
  add constraint contacts_id_owner_unique unique (id, owner_id);

create table public.interaction_contacts (
  interaction_id uuid not null,
  contact_id uuid not null,
  owner_id uuid not null,

  primary key (interaction_id, contact_id),

  -- Composite FKs guarantee the join row's owner matches both the
  -- interaction's owner and the contact's owner. With these, an RLS-evading
  -- cross-user link attempt fails at FK validation rather than needing a
  -- separate trigger.
  foreign key (interaction_id, owner_id)
    references public.interactions (id, owner_id) on delete cascade,
  foreign key (contact_id, owner_id)
    references public.contacts (id, owner_id) on delete cascade
);

create index interaction_contacts_contact_id_idx
  on public.interaction_contacts (contact_id);
create index interaction_contacts_owner_id_idx
  on public.interaction_contacts (owner_id);

alter table public.interactions enable row level security;
alter table public.interaction_contacts enable row level security;

create policy interactions_select_own
  on public.interactions
  for select
  using (owner_id = auth.uid());

create policy interactions_insert_own
  on public.interactions
  for insert
  with check (owner_id = auth.uid());

create policy interactions_update_own
  on public.interactions
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy interaction_contacts_select_own
  on public.interaction_contacts
  for select
  using (owner_id = auth.uid());

create policy interaction_contacts_insert_own
  on public.interaction_contacts
  for insert
  with check (owner_id = auth.uid());

-- Defence-in-depth for the "at least one Contact" invariant: the RPC raises
-- on an empty contact-ids array, but a direct PostgREST insert that bypasses
-- the RPC must also be rejected. A DEFERRABLE INITIALLY DEFERRED constraint
-- trigger checks at COMMIT time — the RPC wraps both inserts in one
-- transaction so its check sees the join row; an autocommit direct insert
-- commits with no join row and fails.
create function public.interactions_require_contact()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.interaction_contacts
    where interaction_id = new.id
  ) then
    raise exception 'interaction % has no linked contacts', new.id;
  end if;
  return null;
end;
$$;

create constraint trigger interactions_require_contact_at_commit
  after insert on public.interactions
  deferrable initially deferred
  for each row execute function public.interactions_require_contact();

-- create_interaction: insert the interaction + its Contact links atomically.
-- SECURITY INVOKER so RLS WITH CHECK and the composite FK both apply with the
-- caller's identity — a User cannot create an Interaction linked to another
-- User's Contact (the FK to (contact_id, owner_id) fails).
create function public.create_interaction(
  p_time timestamptz,
  p_kind text,
  p_notes text,
  p_status text,
  p_contact_ids uuid[]
) returns uuid
language plpgsql
as $$
declare
  v_owner uuid := auth.uid();
  v_id uuid;
  v_contact uuid;
begin
  if v_owner is null then
    raise exception 'unauthenticated';
  end if;
  if p_contact_ids is null or cardinality(p_contact_ids) = 0 then
    raise exception 'at least one contact required';
  end if;

  insert into public.interactions (owner_id, time, kind, notes, status)
  values (v_owner, p_time, p_kind, p_notes, p_status)
  returning id into v_id;

  foreach v_contact in array p_contact_ids loop
    insert into public.interaction_contacts
      (interaction_id, contact_id, owner_id)
    values (v_id, v_contact, v_owner);
  end loop;

  return v_id;
end;
$$;
