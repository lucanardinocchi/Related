-- Cached platform messages for email, Instagram, and X (seeded demo data and
-- future webhook/API persistence). WhatsApp and TikTok use dedicated tables;
-- iMessage uses message_threads / messages.

create table public.comms_platform_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  platform text not null check (platform in ('email', 'instagram', 'x')),
  external_id text not null,
  direction text not null check (direction in ('sent', 'received')),
  body text not null default '',
  subject text,
  snippet text,
  sent_at timestamptz not null,
  created_at timestamptz not null default now(),

  unique (owner_id, platform, external_id)
);

create index comms_platform_messages_contact_sent_at_idx
  on public.comms_platform_messages (owner_id, contact_id, sent_at desc);

alter table public.comms_platform_messages enable row level security;

create policy comms_platform_messages_select_own
  on public.comms_platform_messages for select using (owner_id = auth.uid());
