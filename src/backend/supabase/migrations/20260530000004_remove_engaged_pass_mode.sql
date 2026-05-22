-- Remove engaged from scheduled_passes mode constraint.
-- User-initiated Engaged Passes are retired; Ambient Intelligence runs
-- via baseline and triggered modes only.

delete from public.scheduled_passes
where mode = 'engaged'
  and dispatched_at is null;

alter table public.scheduled_passes
  drop constraint scheduled_passes_mode_valid;

alter table public.scheduled_passes
  add constraint scheduled_passes_mode_valid
  check (mode in ('baseline', 'triggered'));
