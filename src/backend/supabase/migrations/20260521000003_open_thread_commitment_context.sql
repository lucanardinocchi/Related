-- Commitment "why" context: two optional free-text fields the User fills in
-- to explain why a Commitment matters. Surfaced in the web /commitments page
-- as the expandable per-row dropdown.
--
--   why_helps_person: why following through helps the other person
--   why_i_can_help:   why the User is in a position to follow through
--
-- Both nullable — existing rows remain valid and the User can fill them in
-- ad-hoc from the Commitments view.
alter table public.open_threads
  add column why_helps_person text,
  add column why_i_can_help text;

-- DELETE policy on the join table so the User can re-assign a Commitment's
-- relationship via set_open_thread_relationships. The original migration
-- (20260518000001) only added SELECT + INSERT policies; replace-semantics
-- require deleting the existing join rows.
create policy open_thread_relationships_delete_own
  on public.open_thread_relationships
  for delete
  using (owner_id = auth.uid());

-- set_open_thread_relationships: atomically replace the set of relationships
-- linked to an Open Thread. Mirrors create_open_thread's safety properties —
-- SECURITY INVOKER so RLS + composite FKs (relationship_id, owner_id) reject
-- cross-user links, and the "at least one relationship required" invariant
-- holds on update as on insert.
create function public.set_open_thread_relationships(
  p_open_thread_id uuid,
  p_relationship_ids uuid[]
) returns void
language plpgsql
as $$
declare
  v_owner uuid := auth.uid();
  v_rel uuid;
begin
  if v_owner is null then
    raise exception 'unauthenticated';
  end if;
  if p_relationship_ids is null or cardinality(p_relationship_ids) = 0 then
    raise exception 'at least one relationship required';
  end if;

  -- RLS ensures the User can only see/delete their own join rows; the explicit
  -- owner_id filter is defence-in-depth and keeps the query plan tight.
  delete from public.open_thread_relationships
  where open_thread_id = p_open_thread_id
    and owner_id = v_owner;

  foreach v_rel in array p_relationship_ids loop
    insert into public.open_thread_relationships
      (open_thread_id, relationship_id, owner_id)
    values (p_open_thread_id, v_rel, v_owner);
  end loop;
end;
$$;
