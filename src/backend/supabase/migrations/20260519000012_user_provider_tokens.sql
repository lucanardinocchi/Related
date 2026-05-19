-- ADR-0006 storage layer. Per-User OAuth tokens for external integrations
-- (v1: Google Calendar). The token here is the provider_token Supabase Auth
-- hands us off the session immediately after OAuth — Supabase doesn't persist
-- it for us, so we stash it here so the daily collector Edge Function can
-- replay it server-side.
--
-- One row per (User, provider). Refresh tokens are nullable because some
-- providers issue them only on first consent (with access_type=offline +
-- prompt=consent); we should treat absence as "User needs to re-consent".
create table public.user_provider_tokens (
  owner_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scopes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (owner_id, provider),

  constraint user_provider_tokens_provider_valid
    check (provider in ('google'))
);

create index user_provider_tokens_owner_idx
  on public.user_provider_tokens (owner_id);

alter table public.user_provider_tokens enable row level security;

create policy user_provider_tokens_select_own
  on public.user_provider_tokens for select using (owner_id = auth.uid());

create policy user_provider_tokens_insert_own
  on public.user_provider_tokens for insert with check (owner_id = auth.uid());

create policy user_provider_tokens_update_own
  on public.user_provider_tokens for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy user_provider_tokens_delete_own
  on public.user_provider_tokens for delete using (owner_id = auth.uid());
