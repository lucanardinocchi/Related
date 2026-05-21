-- Lets the signed-in User mark a scheduled_pass row dispatched after the
-- web client runs an Ambient Intelligence Pass (baseline / triggered).
create function public.complete_scheduled_pass(p_pass_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.scheduled_passes
  set dispatched_at = now()
  where id = p_pass_id
    and owner_id = auth.uid()
    and dispatched_at is null;
end;
$$;

grant execute on function public.complete_scheduled_pass(uuid) to authenticated;
