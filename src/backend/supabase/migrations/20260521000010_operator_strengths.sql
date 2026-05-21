-- Repair migration: operator_strengths was originally versioned as
-- 20260521000005, but that slot was already applied on the hosted DB as
-- the events migration (see a1c3025). The context page's
-- listOperatorStrengths() query 500'd with "relation does not exist".
--
-- Idempotent guards so this is safe on fresh local stacks that already
-- picked up 20260521000005_operator_strengths.sql.

create table if not exists public.operator_strengths (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operator_strengths_owner_id_idx
  on public.operator_strengths (owner_id);

alter table public.operator_strengths enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'operator_strengths'
      and policyname = 'operator_strengths_select_own'
  ) then
    create policy operator_strengths_select_own
      on public.operator_strengths for select using (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'operator_strengths'
      and policyname = 'operator_strengths_insert_own'
  ) then
    create policy operator_strengths_insert_own
      on public.operator_strengths for insert with check (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'operator_strengths'
      and policyname = 'operator_strengths_update_own'
  ) then
    create policy operator_strengths_update_own
      on public.operator_strengths for update
      using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'operator_strengths'
      and policyname = 'operator_strengths_delete_own'
  ) then
    create policy operator_strengths_delete_own
      on public.operator_strengths for delete using (owner_id = auth.uid());
  end if;
end $$;

drop trigger if exists operator_strengths_touch_updated_at on public.operator_strengths;
create trigger operator_strengths_touch_updated_at
  before update on public.operator_strengths
  for each row execute function public.touch_updated_at();
