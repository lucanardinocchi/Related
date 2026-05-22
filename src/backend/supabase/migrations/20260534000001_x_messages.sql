-- X (Twitter) DM messages: persisted send/receive cache for relationship + group comms.

create table public.x_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  x_message_id text not null,
  x_conversation_id text,
  direction text not null check (direction in ('sent', 'received')),
  text text,
  sent_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (owner_id, x_message_id),
  check (contact_id is not null or group_id is not null)
);

create index x_messages_owner_contact_sent_at_idx
  on public.x_messages (owner_id, contact_id, sent_at desc);

create index x_messages_owner_group_sent_at_idx
  on public.x_messages (owner_id, group_id, sent_at desc);

create index x_messages_owner_conversation_idx
  on public.x_messages (owner_id, x_conversation_id);

alter table public.x_messages enable row level security;

create policy x_messages_select_own
  on public.x_messages for select using (owner_id = auth.uid());

-- service role inserts via edge functions; no user-facing insert/update/delete RLS
-- (mirrors instagram_messages model)

alter publication supabase_realtime add table public.x_messages;
