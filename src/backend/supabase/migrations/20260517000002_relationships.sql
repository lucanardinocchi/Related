-- Relationship: the bond from the User to either a single Contact or a single
-- Group. Polymorphic target per ADR-0004. Slice 2 lands Contact targets only;
-- Group targets arrive in Slice 6 (a future migration will add the FK column
-- and widen the target_type CHECK).
create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null,
  target_contact_id uuid references public.contacts (id) on delete cascade,
  -- target_group_id is declared now (NULL only, no FK) so the polymorphic
  -- CHECK can encode "exactly one target set" — Slice 6 adds the FK and
  -- widens the target_type whitelist to include 'group'.
  target_group_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint relationships_target_type_valid
    check (target_type in ('contact')),

  constraint relationships_target_consistent
    check (
      target_type = 'contact'
      and target_contact_id is not null
      and target_group_id is null
    )
);

create index relationships_owner_id_idx on public.relationships (owner_id);
create index relationships_target_contact_id_idx
  on public.relationships (target_contact_id);

alter table public.relationships enable row level security;

create policy relationships_select_own
  on public.relationships
  for select
  using (owner_id = auth.uid());

create policy relationships_insert_own
  on public.relationships
  for insert
  with check (owner_id = auth.uid());

-- Every Contact gets exactly one Contact-targeted Relationship at creation
-- time. The Relationship is the entity the app reasons about; Contact is just
-- the address-book peg it hangs off (see src/shared/CONTEXT.md).
create function public.contacts_create_relationship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.relationships (owner_id, target_type, target_contact_id)
  values (new.owner_id, 'contact', new.id);
  return new;
end;
$$;

create trigger contacts_after_insert_create_relationship
  after insert on public.contacts
  for each row execute function public.contacts_create_relationship();
