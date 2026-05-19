-- Slice 8: UpdateRoleOrCadence Candidate Action mutates these. Role is a
-- free-text label the User uses for themselves ('close friend', 'mentor',
-- 'acquaintance'); cadence is a free-text preferred-touch interval ('weekly',
-- 'every few months'). Neither is canonicalised in v1 — the agent reads
-- whatever the User wrote, RLS gates writes.
alter table public.relationships
  add column role text,
  add column cadence text;
