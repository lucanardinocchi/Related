-- Ambient Intelligence (baseline / triggered passes) requires an active
-- subscription. Enforced when marking a scheduled pass dispatched.
create or replace function public.complete_scheduled_pass(p_pass_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_status text;
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;

  select status into v_status
  from public.user_subscriptions
  where owner_id = v_owner;

  if v_status is null or v_status not in ('active', 'trialing') then
    raise exception 'subscription_required'
      using hint = 'Ambient Intelligence requires an active subscription';
  end if;

  update public.scheduled_passes
  set dispatched_at = now()
  where id = p_pass_id
    and owner_id = v_owner
    and dispatched_at is null
    and mode in ('baseline', 'triggered');
end;
$$;
