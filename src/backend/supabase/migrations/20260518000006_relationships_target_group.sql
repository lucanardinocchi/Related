-- Activate the second branch of Relationship.target per ADR-0004. Slice 2
-- landed the table with target_group_id declared as a NULL-only column and
-- the CHECK whitelist restricted to 'contact'. Slice 6 turns the column
-- into a real polymorphic alternative: composite FK to groups(id, owner_id)
-- so owner consistency is FK-enforced, widened target_type whitelist, and
-- the consistency CHECK now requires exactly one of {contact, group}.

-- Composite FK — matches the (id, owner_id) pattern already used by
-- contacts ↔ interaction_contacts and groups ↔ contact_groups.
alter table public.relationships
  add constraint relationships_target_group_fk
  foreign key (target_group_id, owner_id)
  references public.groups (id, owner_id) on delete cascade;

alter table public.relationships
  drop constraint relationships_target_type_valid;
alter table public.relationships
  add constraint relationships_target_type_valid
  check (target_type in ('contact', 'group'));

alter table public.relationships
  drop constraint relationships_target_consistent;
alter table public.relationships
  add constraint relationships_target_consistent
  check (
    (
      target_type = 'contact'
      and target_contact_id is not null
      and target_group_id is null
    )
    or
    (
      target_type = 'group'
      and target_group_id is not null
      and target_contact_id is null
    )
  );

create index relationships_target_group_id_idx
  on public.relationships (target_group_id);

-- Mirror the contacts_create_relationship trigger from slice 2: every Group
-- gets exactly one Group-targeted Relationship at creation time. The
-- Relationship is the entity the agent loop reasons about; Group is just the
-- target peg it hangs off. Without this trigger the Groups tab would be
-- empty for any Group not also wired up via an explicit Relationship row.
create function public.groups_create_relationship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.relationships (owner_id, target_type, target_group_id)
  values (new.owner_id, 'group', new.id);
  return new;
end;
$$;

create trigger groups_after_insert_create_relationship
  after insert on public.groups
  for each row execute function public.groups_create_relationship();
