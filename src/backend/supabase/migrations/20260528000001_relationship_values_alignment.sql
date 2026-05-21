-- User swipe assessments of whether famous media characters' values align
-- with their own. character_id references the static roster slug in shared.
create table public.user_character_values_alignment (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  character_id text not null,
  aligned boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_character_values_alignment_unique
    unique (owner_id, character_id)
);

create index user_character_values_alignment_owner_id_idx
  on public.user_character_values_alignment (owner_id);

create index user_character_values_alignment_character_id_idx
  on public.user_character_values_alignment (character_id);

alter table public.user_character_values_alignment enable row level security;

create policy user_character_values_alignment_select_own
  on public.user_character_values_alignment
  for select
  using (owner_id = auth.uid());

create policy user_character_values_alignment_insert_own
  on public.user_character_values_alignment
  for insert
  with check (owner_id = auth.uid());

create policy user_character_values_alignment_update_own
  on public.user_character_values_alignment
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy user_character_values_alignment_delete_own
  on public.user_character_values_alignment
  for delete
  using (owner_id = auth.uid());

create trigger user_character_values_alignment_touch_updated_at
  before update on public.user_character_values_alignment
  for each row
  execute function public.touch_updated_at();
