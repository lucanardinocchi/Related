-- Pocket AI voice recorder integration: API-key auth, transcript import into
-- closed pocket-sourced Chats (hidden from Conversational rail), Extraction Pass.

-- Extend provider enum for user_provider_tokens.
alter table public.user_provider_tokens
  drop constraint if exists user_provider_tokens_provider_valid;

alter table public.user_provider_tokens
  add constraint user_provider_tokens_provider_valid
    check (provider in (
      'google', 'instagram', 'x', 'whatsapp', 'tiktok', 'outlook', 'pocket'
    ));

-- Distinguish Conversational Chats from Pocket imports in the agent rail.
alter table public.chats
  add column if not exists source text not null default 'conversational',
  add column if not exists external_id text;

alter table public.chats
  drop constraint if exists chats_source_valid;

alter table public.chats
  add constraint chats_source_valid
    check (source in ('conversational', 'pocket'));

create unique index if not exists chats_owner_source_external_id_idx
  on public.chats (owner_id, source, external_id)
  where external_id is not null;

create index if not exists chats_owner_conversational_recent_idx
  on public.chats (owner_id, created_at desc)
  where source = 'conversational';

-- Connect metadata: account display name + connect date (import window start).
create table public.pocket_integration (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  account_display_name text not null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.pocket_integration enable row level security;

create policy pocket_integration_select_own
  on public.pocket_integration for select using (owner_id = auth.uid());

create policy pocket_integration_insert_own
  on public.pocket_integration for insert with check (owner_id = auth.uid());

create policy pocket_integration_update_own
  on public.pocket_integration for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy pocket_integration_delete_own
  on public.pocket_integration for delete using (owner_id = auth.uid());

-- Permanent dedup: once imported, a Pocket recording ID is never re-imported.
create table public.pocket_imports (
  owner_id uuid not null references auth.users (id) on delete cascade,
  recording_id text not null,
  chat_id uuid references public.chats (id) on delete set null,
  recording_title text,
  imported_at timestamptz not null default now(),
  primary key (owner_id, recording_id)
);

create index pocket_imports_owner_imported_idx
  on public.pocket_imports (owner_id, imported_at desc);

alter table public.pocket_imports enable row level security;

create policy pocket_imports_select_own
  on public.pocket_imports for select using (owner_id = auth.uid());

-- Speaker label ambiguities surfaced to the User for manual resolution.
create table public.pocket_speaker_ambiguities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  recording_id text not null,
  recording_title text,
  recording_created_at timestamptz,
  speakers text[] not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_speaker text,
  constraint pocket_speaker_ambiguities_owner_recording_unique
    unique (owner_id, recording_id)
);

create index pocket_speaker_ambiguities_owner_pending_idx
  on public.pocket_speaker_ambiguities (owner_id, created_at desc)
  where resolved_at is null;

alter table public.pocket_speaker_ambiguities enable row level security;

create policy pocket_speaker_ambiguities_select_own
  on public.pocket_speaker_ambiguities for select using (owner_id = auth.uid());

create policy pocket_speaker_ambiguities_update_own
  on public.pocket_speaker_ambiguities for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
