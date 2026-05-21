-- Drop the inferred_signal_calendar_overlay table.
--
-- Background: #55 introduced this sidecar to layer status + category onto
-- read-only Google Calendar rows in `inferred_signal_calendar`. ADR-0010
-- replaced that read-only-plus-overlay model with the unified, editable
-- `events` table — the web /calendar page now reads from `events` end to
-- end and never touches the overlay. The CalendarEventsClient overlay
-- methods were removed in the same change, so nothing in app code reads
-- or writes this table.
--
-- CASCADE takes the (owner_id, event_id) PK, the owner_id index, and the
-- four RLS policies with it. The table holds zero meaningful data — it
-- was created in 20260521000003 and never wired up to a UI flow that
-- shipped to prod.

drop table if exists public.inferred_signal_calendar_overlay cascade;
