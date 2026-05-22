-- Server-side Ambient Intelligence dispatch: service-role completion RPC,
-- pg_cron → ambient-dispatch Edge Function (replaces web client poll).

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

revoke all on function public.complete_scheduled_pass_service(uuid) from public;
grant execute on function public.complete_scheduled_pass_service(uuid) to service_role;

-- Cron helper: POST ambient-dispatch to drain pending subscribed passes.
create or replace function public.dispatch_ambient_passes()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
begin
  begin
    select decrypted_secret into v_url
    from vault.decrypted_secrets
    where name = 'ambient_dispatch_url'
    limit 1;
  exception when others then
    v_url := null;
  end;

  if v_url is null then
    raise notice 'dispatch_ambient_passes: ambient_dispatch_url secret not set; skipping.';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json'),
    body := jsonb_build_object('drain', true, 'limit', 10)
  );
end;
$$;

-- Every minute, drain up to 10 pending ambient passes (subscribed Users only).
select cron.schedule(
  'ambient-pass-dispatch',
  '* * * * *',
  'select public.dispatch_ambient_passes();'
);

-- Production URL for pg_cron (Related project). Idempotent.
do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'ambient_dispatch_url'
  ) then
    perform vault.create_secret(
      'https://yawclybcwwtrrnuyotdm.supabase.co/functions/v1/ambient-dispatch',
      'ambient_dispatch_url',
      'Ambient Intelligence dispatch Edge Function URL'
    );
  end if;
end;
$$;
