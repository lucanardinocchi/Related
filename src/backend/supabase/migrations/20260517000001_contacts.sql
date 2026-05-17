-- Contact: a person the User knows. Identified by name + optional channels.
-- A Contact is owned by exactly one User; RLS enforces that ownership.
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_owner_id_idx on public.contacts (owner_id);

alter table public.contacts enable row level security;

create policy contacts_select_own
  on public.contacts
  for select
  using (owner_id = auth.uid());

create policy contacts_insert_own
  on public.contacts
  for insert
  with check (owner_id = auth.uid());
