-- TikTok Business Messaging integration: contact/group identifiers, message
-- storage (webhook + outbound sends), and OAuth token storage.

alter table public.contacts
  add column tiktok_username text,
  add column tiktok_open_id text;

alter table public.groups
  add column tiktok_dm_conversation_id text;

alter table public.user_provider_tokens
  drop constraint user_provider_tokens_provider_valid;

alter table public.user_provider_tokens
  add constraint user_provider_tokens_provider_valid
    check (provider in ('google', 'instagram', 'x', 'whatsapp', 'tiktok'));

create table public.tiktok_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  group_id uuid references public.groups (id) on delete set null,
  tiktok_message_id text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  from_username text,
  text text not null default '',
  sent_at timestamptz not null,
  tiktok_conversation_id text,
  created_at timestamptz not null default now(),
  unique (owner_id, tiktok_message_id)
);

create index tiktok_messages_contact_sent_at_idx
  on public.tiktok_messages (owner_id, contact_id, sent_at desc);

create index tiktok_messages_group_sent_at_idx
  on public.tiktok_messages (owner_id, group_id, sent_at desc);

create index tiktok_messages_conversation_id_idx
  on public.tiktok_messages (owner_id, tiktok_conversation_id);

alter table public.tiktok_messages enable row level security;

create policy tiktok_messages_select_own
  on public.tiktok_messages for select using (owner_id = auth.uid());

alter publication supabase_realtime add table public.tiktok_messages;
