-- 7-day Ambient Intelligence trial from account creation, then subscription required.

create or replace function public.is_within_ambient_trial(p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = p_owner_id
      and u.created_at > now() - interval '7 days'
  );
$$;

create or replace function public.has_ambient_intelligence_access(p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_within_ambient_trial(p_owner_id)
    or exists (
      select 1
      from public.user_subscriptions s
      where s.owner_id = p_owner_id
        and s.status in ('active', 'trialing')
    );
$$;

create or replace function public.can_run_ambient_intelligence(p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_ambient_intelligence_enabled(p_owner_id)
    and public.has_ambient_intelligence_access(p_owner_id);
$$;

grant execute on function public.is_within_ambient_trial(uuid) to authenticated, service_role;
grant execute on function public.has_ambient_intelligence_access(uuid) to authenticated, service_role;
grant execute on function public.can_run_ambient_intelligence(uuid) to authenticated, service_role;

create or replace function public.guard_ambient_intelligence_enabled()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if TG_OP = 'INSERT' or NEW.enabled is distinct from OLD.enabled then
    if NEW.enabled = true
      and not public.has_ambient_intelligence_access(NEW.owner_id) then
      raise exception 'subscription_required'
        using hint = 'Subscribe to enable Ambient Intelligence after your free trial';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists ambient_intelligence_preferences_guard_enabled
  on public.ambient_intelligence_preferences;
create trigger ambient_intelligence_preferences_guard_enabled
  before insert or update on public.ambient_intelligence_preferences
  for each row execute function public.guard_ambient_intelligence_enabled();

create or replace function public.complete_scheduled_pass(p_pass_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_ambient_intelligence_enabled(v_owner) then
    raise exception 'ambient_intelligence_disabled'
      using hint = 'Ambient Intelligence is turned off in Settings';
  end if;

  if not public.has_ambient_intelligence_access(v_owner) then
    raise exception 'subscription_required'
      using hint = 'Ambient Intelligence requires a subscription after your free trial';
  end if;

  update public.scheduled_passes
  set dispatched_at = now()
  where id = p_pass_id
    and owner_id = v_owner
    and dispatched_at is null
    and mode in ('baseline', 'triggered');
end;
$$;

create or replace function public.complete_scheduled_pass_service(p_pass_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from public.scheduled_passes
  where id = p_pass_id
    and dispatched_at is null
    and mode in ('baseline', 'triggered');

  if v_owner is null then
    return;
  end if;

  if not public.can_run_ambient_intelligence(v_owner) then
    return;
  end if;

  update public.scheduled_passes
  set dispatched_at = now()
  where id = p_pass_id
    and owner_id = v_owner
    and dispatched_at is null
    and mode in ('baseline', 'triggered');
end;
$$;
