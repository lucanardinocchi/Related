-- Store diarized transcript segments on ambiguity rows so the agent-page
-- resolution UI can render previews without re-fetching Pocket.

alter table public.pocket_speaker_ambiguities
  add column if not exists transcript_segments jsonb;

comment on column public.pocket_speaker_ambiguities.transcript_segments is
  'Array of {speaker, text} segments captured when import was blocked on speaker ambiguity.';
