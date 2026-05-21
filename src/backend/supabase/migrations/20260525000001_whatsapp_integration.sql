-- WhatsApp Business Cloud API integration: contact/group identifiers, message
-- storage (webhook + outbound sends), and OAuth token storage.

alter table public.contacts
  add column whatsapp_wa_id text;

alter table public.groups
  add column whatsapp_group_id text;

alter table public.user_provider_tokens
  drop constraint user_provider_tokens_provider_valid;

alter table public.user_provider_tokens
  add constraint user_provider_tokens_provider_valid
    check (provider in ('google', 'instagram', 'x', 'whatsapp'));

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  group_id uuid references public.groups (id) on delete set null,
  wa_message_id text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  from_phone text,
  from_name text,
  text text not null default '',
  sent_at timestamptz not null,
  whatsapp_group_id text,
  created_at timestamptz not null default now(),
  unique (owner_id, wa_message_id)
);

create index whatsapp_messages_contact_sent_at_idx
  on public.whatsapp_messages (owner_id, contact_id, sent_at desc);

create index whatsapp_messages_group_sent_at_idx
  on public.whatsapp_messages (owner_id, group_id, sent_at desc);

create index whatsapp_messages_whatsapp_group_id_idx
  on public.whatsapp_messages (owner_id, whatsapp_group_id);

alter table public.whatsapp_messages enable row level security;

create policy whatsapp_messages_select_own
  on public.whatsapp_messages for select using (owner_id = auth.uid());

alter publication supabase_realtime add table public.whatsapp_messages;
