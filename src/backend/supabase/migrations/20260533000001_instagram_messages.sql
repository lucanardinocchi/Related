-- Instagram DM storage (inbound via instagram-webhook, outbound via instagram-dm).

create table public.instagram_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  ig_message_id text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  from_username text,
  from_scoped_id text,
  text text not null default '',
  sent_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (owner_id, ig_message_id)
);

create index instagram_messages_contact_sent_at_idx
  on public.instagram_messages (owner_id, contact_id, sent_at desc);

create index instagram_messages_from_scoped_id_idx
  on public.instagram_messages (owner_id, from_scoped_id);

alter table public.instagram_messages enable row level security;

create policy instagram_messages_select_own
  on public.instagram_messages for select using (owner_id = auth.uid());

alter publication supabase_realtime add table public.instagram_messages;
