-- ADR-0012 — provenance on relationship context rows + SECURITY DEFINER RPCs
-- for the extract-context Edge Function (User JWT and Pocket service-role paths).

alter table public.interactions
  add column capture_source text not null default 'manual',
  add column source_chat_id uuid references public.chats (id) on delete set null;

alter table public.interactions
  add constraint interactions_capture_source_valid
    check (capture_source in ('manual', 'conversational_extraction', 'pocket_extraction'));

create index interactions_source_chat_idx
  on public.interactions (source_chat_id)
  where source_chat_id is not null;

alter table public.open_threads
  add column capture_source text not null default 'manual',
  add column source_chat_id uuid references public.chats (id) on delete set null;

alter table public.open_threads
  add constraint open_threads_capture_source_valid
    check (capture_source in ('manual', 'conversational_extraction', 'pocket_extraction'));

create index open_threads_source_chat_idx
  on public.open_threads (source_chat_id)
  where source_chat_id is not null;

-- extraction_create_interaction: mirrors create_interaction group/1:1 semantics
-- with provenance + explicit owner (service-role safe).
create function public.extraction_create_interaction(
  p_owner_id uuid,
  p_source_chat_id uuid,
  p_capture_source text,
  p_time timestamptz,
  p_kind text,
  p_notes text,
  p_status text,
  p_contact_ids uuid[],
  p_group_id uuid default null,
  p_category text default 'personal'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_contact uuid;
  v_member_count int;
  v_chat_owner uuid;
begin
  if p_owner_id is null then
    raise exception 'owner required';
  end if;
  if auth.uid() is not null and auth.uid() <> p_owner_id then
    raise exception 'forbidden';
  end if;
  if p_capture_source not in ('conversational_extraction', 'pocket_extraction') then
    raise exception 'invalid capture_source %', p_capture_source;
  end if;

  select owner_id into v_chat_owner
  from public.chats
  where id = p_source_chat_id;
  if v_chat_owner is null then
    raise exception 'source chat not found';
  end if;
  if v_chat_owner <> p_owner_id then
    raise exception 'source chat owner mismatch';
  end if;

  if p_group_id is null
     and (p_contact_ids is null or cardinality(p_contact_ids) = 0) then
    raise exception 'at least one contact required';
  end if;

  insert into public.interactions (
    owner_id, time, kind, notes, status, group_id, category,
    capture_source, source_chat_id
  )
  values (
    p_owner_id, p_time, p_kind, p_notes, p_status, p_group_id, p_category,
    p_capture_source, p_source_chat_id
  )
  returning id into v_id;

  if p_contact_ids is not null then
    foreach v_contact in array p_contact_ids loop
      insert into public.interaction_contacts
        (interaction_id, contact_id, owner_id)
      values (v_id, v_contact, p_owner_id)
      on conflict (interaction_id, contact_id) do nothing;
    end loop;
  end if;

  if p_group_id is not null then
    insert into public.interaction_contacts (interaction_id, contact_id, owner_id)
    select v_id, cg.contact_id, p_owner_id
    from public.contact_groups cg
    where cg.group_id = p_group_id
      and cg.owner_id = p_owner_id
    on conflict (interaction_id, contact_id) do nothing;

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

-- extraction_create_open_thread: provenance + explicit owner.
create function public.extraction_create_open_thread(
  p_owner_id uuid,
  p_source_chat_id uuid,
  p_capture_source text,
  p_description text,
  p_direction text,
  p_relationship_ids uuid[],
  p_origin text default null,
  p_communication_status text default 'not_communicated'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_rel uuid;
  v_chat_owner uuid;
begin
  if p_owner_id is null then
    raise exception 'owner required';
  end if;
  if auth.uid() is not null and auth.uid() <> p_owner_id then
    raise exception 'forbidden';
  end if;
  if p_capture_source not in ('conversational_extraction', 'pocket_extraction') then
    raise exception 'invalid capture_source %', p_capture_source;
  end if;
  if p_relationship_ids is null or cardinality(p_relationship_ids) = 0 then
    raise exception 'at least one relationship required';
  end if;

  select owner_id into v_chat_owner
  from public.chats
  where id = p_source_chat_id;
  if v_chat_owner is null then
    raise exception 'source chat not found';
  end if;
  if v_chat_owner <> p_owner_id then
    raise exception 'source chat owner mismatch';
  end if;

  insert into public.open_threads (
    owner_id, description, direction, origin, communication_status,
    capture_source, source_chat_id
  )
  values (
    p_owner_id, p_description, p_direction, p_origin, p_communication_status,
    p_capture_source, p_source_chat_id
  )
  returning id into v_id;

  foreach v_rel in array p_relationship_ids loop
    insert into public.open_thread_relationships
      (open_thread_id, relationship_id, owner_id)
    values (v_id, v_rel, p_owner_id);
  end loop;

  return v_id;
end;
$$;
