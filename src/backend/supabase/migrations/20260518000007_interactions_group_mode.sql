-- Slice 6 — Group-mode Interactions. Adds an optional Group linkage to
-- interactions and a `create_interaction` overload that, when given a group
-- id, populates interaction_contacts from current group membership at
-- capture time. Per ADR-0004: a Group-mode Interaction touches the Group
-- Relationship AND every member Contact's individual Relationship; a 1:1
-- Interaction with a member Contact does NOT update the Group Relationship.
-- Group-mode is explicit (set at capture time, never inferred from member
-- overlap on the contact list).

alter table public.interactions
  add column group_id uuid;

-- Composite FK so the join's owner consistency is FK-enforced (same pattern
-- as interaction_contacts, contact_groups, and relationships.target_group_id).
alter table public.interactions
  add constraint interactions_group_id_fk
  foreign key (group_id, owner_id)
  references public.groups (id, owner_id) on delete set null;

create index interactions_group_id_idx
  on public.interactions (group_id)
  where group_id is not null;

-- Overload of create_interaction with an optional p_group_id at the END so
-- existing callers (5-arg signature) keep resolving unchanged. PostgREST
-- exposes the new signature side-by-side; the client picks the one whose
-- named-parameter set matches.
--
-- Semantics when p_group_id is set:
--   - The Interaction row stores group_id.
--   - interaction_contacts is populated from CURRENT group membership at
--     capture time (so renaming or removing a member later does not retro-
--     actively change the historical Interaction's contact set).
--   - p_contact_ids may be empty in this mode; if non-empty its entries are
--     unioned in (with ON CONFLICT DO NOTHING so duplicates are silent).
-- When p_group_id is null this overload behaves exactly like the original
-- RPC.
create function public.create_interaction(
  p_time timestamptz,
  p_kind text,
  p_notes text,
  p_status text,
  p_contact_ids uuid[],
  p_group_id uuid
) returns uuid
language plpgsql
as $$
declare
  v_owner uuid := auth.uid();
  v_id uuid;
  v_contact uuid;
  v_member_count int;
begin
  if v_owner is null then
    raise exception 'unauthenticated';
  end if;

  -- 1:1 path keeps the original invariant.
  if p_group_id is null
     and (p_contact_ids is null or cardinality(p_contact_ids) = 0) then
    raise exception 'at least one contact required';
  end if;

  insert into public.interactions
    (owner_id, time, kind, notes, status, group_id)
  values (v_owner, p_time, p_kind, p_notes, p_status, p_group_id)
  returning id into v_id;

  if p_contact_ids is not null then
    foreach v_contact in array p_contact_ids loop
      insert into public.interaction_contacts
        (interaction_id, contact_id, owner_id)
      values (v_id, v_contact, v_owner)
      on conflict (interaction_id, contact_id) do nothing;
    end loop;
  end if;

  if p_group_id is not null then
    insert into public.interaction_contacts (interaction_id, contact_id, owner_id)
    select v_id, cg.contact_id, v_owner
    from public.contact_groups cg
    where cg.group_id = p_group_id
      and cg.owner_id = v_owner
    on conflict (interaction_id, contact_id) do nothing;

    -- A Group with no current members still produces a valid Interaction
    -- against the Group Relationship itself; check the deferred-contact
    -- invariant only kicks in if neither the group nor explicit contacts
    -- supplied anyone. Guard here with a friendlier message.
    select count(*) into v_member_count
    from public.interaction_contacts
    where interaction_id = v_id;
    if v_member_count = 0 then
      raise exception 'group % has no current members; nothing to link', p_group_id;
    end if;
  end if;

  return v_id;
end;
$$;
