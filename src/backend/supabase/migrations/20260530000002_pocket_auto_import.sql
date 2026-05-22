-- Automatic Pocket import: queue on transcription.completed webhook, process
-- 15 minutes later via pg_cron → pocket-process-pending.

alter table public.pocket_integration
  add column if not exists pocket_user_id text,
  add column if not exists pocket_user_email text,
  add column if not exists webhook_secret text;

create table if not exists public.pocket_pending_imports (
  owner_id uuid not null references auth.users (id) on delete cascade,
  recording_id text not null,
  recording_title text,
  recording_created_at timestamptz,
  transcription_completed_at timestamptz not null,
  process_at timestamptz not null,
  status text not null default 'pending',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (owner_id, recording_id),

  constraint pocket_pending_imports_status_valid
    check (status in ('pending', 'processing', 'done', 'skipped', 'failed'))
);

create index if not exists pocket_pending_imports_process_at_idx
  on public.pocket_pending_imports (process_at)
  where status = 'pending';

alter table public.pocket_pending_imports enable row level security;

create policy pocket_pending_imports_select_own
  on public.pocket_pending_imports for select using (owner_id = auth.uid());

-- Cron helper: POST pocket-process-pending for due rows.
create or replace function public.dispatch_pocket_pending_imports()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_row record;
begin
  begin
    select decrypted_secret into v_url
    from vault.decrypted_secrets
    where name = 'pocket_process_pending_url'
    limit 1;
  exception when others then
    v_url := null;
  end;

  if v_url is null then
    raise notice 'dispatch_pocket_pending_imports: pocket_process_pending_url secret not set; skipping.';
    return;
  end if;

  for v_row in
    select owner_id, recording_id
    from public.pocket_pending_imports
    where status = 'pending'
      and process_at <= now()
    order by process_at
    limit 50
  loop
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('content-type', 'application/json'),
      body := jsonb_build_object(
        'ownerId', v_row.owner_id,
        'recordingId', v_row.recording_id
      )
    );
  end loop;
end;
$$;

-- Every minute, process Pocket imports whose 15-minute delay has elapsed.
select cron.schedule(
  'pocket-pending-imports',
  '* * * * *',
  'select public.dispatch_pocket_pending_imports();'
);
