-- Rank order for characters the User aligned with (1 = strongest alignment).

alter table public.user_character_values_alignment
  add column if not exists rank_position integer;

alter table public.user_character_values_alignment
  add constraint user_character_values_alignment_rank_positive
  check (rank_position is null or rank_position > 0);

create index if not exists user_character_values_alignment_rank_idx
  on public.user_character_values_alignment (owner_id, rank_position)
  where rank_position is not null;
