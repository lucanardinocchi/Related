-- Mac Messages relay: sync SMS/iMessage threads from a paired Mac into
-- Supabase so the web app can read/send via an outbound queue drained by
-- the relay daemon (imsg on macOS).

-- Paired Mac devices per User.
create table public.relay_devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Mac',
  device_secret_hash text not null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),

  constraint relay_devices_id_owner_unique unique (id, owner_id)
);

create index relay_devices_owner_idx on public.relay_devices (owner_id);

-- One-time pairing codes (web shows code, Mac relay exchanges for device token).
create table public.relay_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint relay_pairing_codes_code_unique unique (code)
);

create index relay_pairing_codes_owner_idx
  on public.relay_pairing_codes (owner_id);

-- Messages.app thread mirror.
create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  external_chat_id text not null,
  external_chat_guid text,
  is_group boolean not null default false,
  display_name text,
  contact_id uuid references public.contacts (id) on delete set null,
  group_id uuid references public.groups (id) on delete set null,
  participant_handles text[] not null default '{}',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint message_threads_id_owner_unique unique (id, owner_id),
  constraint message_threads_owner_external_chat_unique
    unique (owner_id, external_chat_id)
);

create index message_threads_owner_idx on public.message_threads (owner_id);
create index message_threads_contact_idx
  on public.message_threads (owner_id, contact_id)
  where contact_id is not null;
create index message_threads_group_idx
  on public.message_threads (owner_id, group_id)
  where group_id is not null;

-- Synced message bodies (inbound from watch, outbound from queue ack).
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid not null,
  external_message_id text not null,
  direction text not null,
  body text not null default '',
  sent_at timestamptz not null,
  service text,
  created_at timestamptz not null default now(),

  constraint messages_id_owner_unique unique (id, owner_id),
  constraint messages_direction_valid
    check (direction in ('inbound', 'outbound')),
  foreign key (thread_id, owner_id)
    references public.message_threads (id, owner_id) on delete cascade,
  constraint messages_owner_external_unique
    unique (owner_id, external_message_id)
);

create index messages_thread_sent_idx
  on public.messages (thread_id, sent_at);
create index messages_owner_idx on public.messages (owner_id);

-- Web inserts; Mac relay drains and sends via imsg.
create table public.outbound_queue (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid,
  contact_id uuid references public.contacts (id) on delete set null,
  group_id uuid references public.groups (id) on delete set null,
  body text not null,
  status text not null default 'pending',
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,

  constraint outbound_queue_id_owner_unique unique (id, owner_id),
  constraint outbound_queue_status_valid
    check (status in ('pending', 'sent', 'failed')),
  foreign key (thread_id, owner_id)
    references public.message_threads (id, owner_id) on delete set null
);

create index outbound_queue_pending_idx
  on public.outbound_queue (owner_id, created_at)
  where status = 'pending';

alter table public.relay_devices enable row level security;
alter table public.relay_pairing_codes enable row level security;
alter table public.message_threads enable row level security;
alter table public.messages enable row level security;
alter table public.outbound_queue enable row level security;

-- relay_devices: User reads own; inserts/updates via edge functions only
-- (service role). No direct client write policies in v1.
create policy relay_devices_select_own
  on public.relay_devices for select using (owner_id = auth.uid());

create policy relay_pairing_codes_select_own
  on public.relay_pairing_codes for select using (owner_id = auth.uid());

create policy relay_pairing_codes_insert_own
  on public.relay_pairing_codes for insert with check (owner_id = auth.uid());

create policy relay_pairing_codes_update_own
  on public.relay_pairing_codes for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy message_threads_select_own
  on public.message_threads for select using (owner_id = auth.uid());

create policy message_threads_update_own
  on public.message_threads for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy messages_select_own
  on public.messages for select using (owner_id = auth.uid());

create policy outbound_queue_select_own
  on public.outbound_queue for select using (owner_id = auth.uid());

create policy outbound_queue_insert_own
  on public.outbound_queue for insert with check (owner_id = auth.uid());

-- Realtime for live web updates when relay syncs.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.message_threads;
alter publication supabase_realtime add table public.relay_devices;
