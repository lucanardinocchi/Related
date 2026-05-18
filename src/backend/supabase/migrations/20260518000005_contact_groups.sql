-- contact_groups: many-to-many join between Contacts and Groups. Membership
-- is User-curated (a Contact is added to a Group explicitly, never inferred
-- — see src/shared/CONTEXT.md). Same composite-FK pattern as
-- interaction_contacts and open_thread_relationships: pairing the FKs on
-- (id, owner_id) makes the FK validation itself reject cross-user links,
-- so RLS isn't the only line of defence.

-- Mirror the composite uniqueness already on contacts / interactions /
-- open_threads / relationships so the join's FK targets are valid.
alter table public.groups
  add constraint groups_id_owner_unique unique (id, owner_id);

create table public.contact_groups (
  contact_id uuid not null,
  group_id uuid not null,
  owner_id uuid not null,
  created_at timestamptz not null default now(),

  primary key (contact_id, group_id),

  foreign key (contact_id, owner_id)
    references public.contacts (id, owner_id) on delete cascade,
  foreign key (group_id, owner_id)
    references public.groups (id, owner_id) on delete cascade
);

create index contact_groups_group_id_idx
  on public.contact_groups (group_id);
create index contact_groups_owner_id_idx
  on public.contact_groups (owner_id);

alter table public.contact_groups enable row level security;

create policy contact_groups_select_own
  on public.contact_groups
  for select
  using (owner_id = auth.uid());

create policy contact_groups_insert_own
  on public.contact_groups
  for insert
  with check (owner_id = auth.uid());

create policy contact_groups_delete_own
  on public.contact_groups
  for delete
  using (owner_id = auth.uid());

-- add_group_member: insert a contact_groups row attributed to the caller.
-- Mirrors the create_open_thread pattern — runs as SECURITY INVOKER so the
-- composite (id, owner_id) FKs reject any attempt to point at a Contact or
-- Group owned by a different User. Idempotent via ON CONFLICT DO NOTHING
-- so the UI can call it without checking membership first.
create function public.add_group_member(
  p_group_id uuid,
  p_contact_id uuid
) returns void
language plpgsql
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    raise exception 'unauthenticated';
  end if;

  insert into public.contact_groups (contact_id, group_id, owner_id)
  values (p_contact_id, p_group_id, v_owner)
  on conflict (contact_id, group_id) do nothing;
end;
$$;

-- remove_group_member: unlink a Contact from a Group, scoped to the caller.
-- RLS DELETE policy on contact_groups already rejects cross-user attempts;
-- this RPC just provides a symmetric API surface alongside add_group_member.
create function public.remove_group_member(
  p_group_id uuid,
  p_contact_id uuid
) returns void
language plpgsql
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  delete from public.contact_groups
  where group_id = p_group_id
    and contact_id = p_contact_id
    and owner_id = auth.uid();
end;
$$;
