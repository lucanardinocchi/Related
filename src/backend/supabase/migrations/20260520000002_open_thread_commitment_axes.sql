-- ADR-0008: web /commitments page is a filtered view over Open Threads
-- where direction = me_owes_them. Two new axes capture commitment lifecycle:
--   origin: did the other person ask, or did I decide?
--   communication_status: have I told them about it yet?
-- See src/shared/CONTEXT.md for the full Open Thread + Commitments view
-- glossary entries.
--
-- Both columns are nullable-or-defaulted so existing rows remain valid:
--   - origin: nullable. Existing rows get NULL. For new threads with
--     direction = they_owe_me, origin is meaningless and stays NULL. For new
--     direction = me_owes_them threads created from the Commitments UI, the
--     client supplies a value.
--   - communication_status: NOT NULL with DEFAULT 'not_communicated'. The
--     conservative default — the User has to actively flip it to 'confirmed'
--     when they've actually told the person. Existing rows get the default.
alter table public.open_threads
  add column origin text,
  add column communication_status text not null default 'not_communicated';

alter table public.open_threads
  add constraint open_threads_origin_valid
    check (origin is null or origin in ('asked_of_me', 'self_led'));

alter table public.open_threads
  add constraint open_threads_communication_status_valid
    check (communication_status in ('not_communicated', 'confirmed'));

-- Partial index to support the Commitments view's primary filter
-- (open me_owes_them threads, often filtered further by origin or status).
create index open_threads_owner_commitments_idx
  on public.open_threads (owner_id, direction, communication_status)
  where closed_at is null and direction = 'me_owes_them';

-- The pre-existing open_threads_update_own policy (see
-- 20260518000001_open_threads.sql) already permits UPDATEs by the owner with
-- no column restriction, so the new columns are writable without a policy
-- change.
