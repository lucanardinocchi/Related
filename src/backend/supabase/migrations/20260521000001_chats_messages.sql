-- ADR-0009: three-agent architecture introduces Chat as a first-class domain
-- entity, scoped to a User and free-form (not tied to a Relationship). Each
-- Chat is the unit of input to one Extraction Pass.
--
-- A Chat carries a lifecycle: `open` (closed_at is null, writable, agent
-- responds, Extraction not yet run) → `closed` (closed_at set, read-only,
-- Extraction runs exactly once). Closing is explicit (User clicks "New
-- Chat" or archives) — there is no idle close. Application logic enforces
-- "no writes to closed Chats"; the DB does not gate this in v1 to keep RLS
-- simple. Tighten later if it bites.
--
-- chat_messages stores the full transcript: role ∈ {user, assistant, system,
-- tool}. Assistant turns may carry tool_use blocks (rendered inline in the
-- UI per Q9 of the grilling) — those land in `tool_calls` jsonb. Tool result
-- messages reference back via `tool_call_id`.

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  closed_at timestamptz,

  constraint chats_id_owner_unique unique (id, owner_id)
);

create index chats_owner_id_idx on public.chats (owner_id);
create index chats_owner_recent_idx
  on public.chats (owner_id, created_at desc);
create index chats_owner_open_idx
  on public.chats (owner_id, created_at desc)
  where closed_at is null;

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null,
  owner_id uuid not null,
  role text not null,
  content text not null,
  tool_calls jsonb,
  tool_call_id text,
  created_at timestamptz not null default now(),

  constraint chat_messages_role_valid
    check (role in ('user', 'assistant', 'system', 'tool')),

  -- Composite FK guarantees the message's owner matches the chat's owner.
  -- Cross-User insert attempts that bypass RLS still fail at FK validation.
  foreign key (chat_id, owner_id)
    references public.chats (id, owner_id) on delete cascade
);

create index chat_messages_chat_id_created_idx
  on public.chat_messages (chat_id, created_at);
create index chat_messages_owner_id_idx
  on public.chat_messages (owner_id);

alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;

create policy chats_select_own
  on public.chats
  for select
  using (owner_id = auth.uid());

create policy chats_insert_own
  on public.chats
  for insert
  with check (owner_id = auth.uid());

create policy chats_update_own
  on public.chats
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy chats_delete_own
  on public.chats
  for delete
  using (owner_id = auth.uid());

create policy chat_messages_select_own
  on public.chat_messages
  for select
  using (owner_id = auth.uid());

create policy chat_messages_insert_own
  on public.chat_messages
  for insert
  with check (owner_id = auth.uid());

create policy chat_messages_delete_own
  on public.chat_messages
  for delete
  using (owner_id = auth.uid());
