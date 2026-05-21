-- ADR-0009 Extraction Pass — idempotency marker on chats. Set by the
-- extract-context Edge Function once the Pass has run successfully on a
-- closed Chat. Re-invocations of the function for the same Chat short-
-- circuit on this column to prevent duplicate Transient Intent rows
-- (Situational State is upsert so it would tolerate re-runs, but TI is
-- append-only).
alter table public.chats
  add column extracted_at timestamptz;

create index chats_owner_extraction_pending_idx
  on public.chats (owner_id)
  where closed_at is not null and extracted_at is null;
