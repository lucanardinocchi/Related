-- User opt-out for Ambient Intelligence. Default is enabled when no row exists.

create table public.ambient_intelligence_preferences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ambient_intelligence_preferences_singleton unique (owner_id)
);

alter table public.ambient_intelligence_preferences enable row level security;

create policy ambient_intelligence_preferences_select_own
  on public.ambient_intelligence_preferences for select using (owner_id = auth.uid());
create policy ambient_intelligence_preferences_insert_own
  on public.ambient_intelligence_preferences for insert with check (owner_id = auth.uid());
create policy ambient_intelligence_preferences_update_own
  on public.ambient_intelligence_preferences for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create trigger ambient_intelligence_preferences_touch_updated_at
  before update on public.ambient_intelligence_preferences
  for each row execute function public.touch_updated_at();

create or replace function public.is_ambient_intelligence_enabled(p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select enabled from public.ambient_intelligence_preferences where owner_id = p_owner_id),
    true
  );
$$;

-- Skip enqueue when the User has turned Ambient Intelligence off.
create or replace function public.enqueue_pass(
  p_owner_id uuid,
  p_relationship_id uuid,
  p_mode text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_mode in ('baseline', 'triggered')
    and not public.is_ambient_intelligence_enabled(p_owner_id) then
    return;
  end if;

  if exists (
    select 1 from public.scheduled_passes
    where owner_id = p_owner_id
      and relationship_id = p_relationship_id
      and mode = p_mode
      and dispatched_at is null
      and created_at > now() - interval '5 minutes'
  ) then
    return;
  end if;

  insert into public.scheduled_passes (owner_id, relationship_id, mode, reason)
  values (p_owner_id, p_relationship_id, p_mode, p_reason);
end;
$$;

-- Client RPC: require subscription and enabled preference.
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

  if not public.is_ambient_intelligence_enabled(v_owner) then
    raise exception 'ambient_intelligence_disabled'
      using hint = 'Ambient Intelligence is turned off in Settings';
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

-- Service-role RPC: skip completion when disabled (pass stays queued).
create or replace function public.complete_scheduled_pass_service(p_pass_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_status text;
begin
  select owner_id into v_owner
  from public.scheduled_passes
  where id = p_pass_id
    and dispatched_at is null
    and mode in ('baseline', 'triggered');

  if v_owner is null then
    return;
  end if;

  if not public.is_ambient_intelligence_enabled(v_owner) then
    return;
  end if;

  select status into v_status
  from public.user_subscriptions
  where owner_id = v_owner;

  if v_status is null or v_status not in ('active', 'trialing') then
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
