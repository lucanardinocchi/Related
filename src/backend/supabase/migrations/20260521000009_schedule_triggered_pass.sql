-- Client-callable Triggered Pass enqueue. The DB triggers on
-- interaction_contacts / open_threads / candidate_actions already call
-- enqueue_pass internally; this RPC is the explicit seam for the Executor
-- (and any future client-side scheduler) per ADR-0001. Debounce inside
-- enqueue_pass coalesces duplicate requests within the 5-minute window.

create function public.schedule_triggered_pass(
  p_relationship_id uuid,
  p_reason text default 'candidate_decision'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_rel record;
begin
  if v_owner is null then
    raise exception 'unauthenticated';
  end if;

  select id, owner_id into v_rel
  from public.relationships
  where id = p_relationship_id
    and owner_id = v_owner;

  if v_rel.id is null then
    raise exception 'relationship not found or not owned by caller';
  end if;

  perform public.enqueue_pass(v_owner, p_relationship_id, 'triggered', p_reason);
end;
$$;

grant execute on function public.schedule_triggered_pass(uuid, text) to authenticated;
