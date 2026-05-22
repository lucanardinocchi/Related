-- Calendar changes are driven by connect-time backfill + push webhooks.
-- Subscription renewal remains on calendar-renew-subscriptions (09:00 UTC).

select cron.unschedule('calendar-daily-sync');
