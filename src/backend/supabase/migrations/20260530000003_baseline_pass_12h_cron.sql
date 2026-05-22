-- Reschedule Baseline Pass from every 6 hours to every 12 hours.
-- Replaces the pg_cron job installed in 20260519000002_pass_scheduler.sql.

select cron.unschedule('baseline-passes-every-6-hours');

-- pg_cron: every 12 hours. The local Supabase stack ships pg_cron; in the
-- hosted environment the schedule is the same. We don't pin the slot
-- (cron `0 */12 * * *`) since the agent is global, not per-User.
select cron.schedule(
  'baseline-passes-every-12-hours',
  '0 */12 * * *',
  'select public.schedule_baseline_passes();'
);
