-- Snapshot AI-suggested / dynamic characters so rank + inference survive refresh.

alter table public.user_character_values_alignment
  add column if not exists character_name text,
  add column if not exists character_source text,
  add column if not exists character_values jsonb;
