-- Wire pocket-process-pending URL for pg_cron (Related production project).
-- Idempotent: skip if secret already exists.

do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'pocket_process_pending_url'
  ) then
    perform vault.create_secret(
      'https://yawclybcwwtrrnuyotdm.supabase.co/functions/v1/pocket-process-pending',
      'pocket_process_pending_url',
      'Pocket pending import processor URL'
    );
  end if;
end;
$$;
