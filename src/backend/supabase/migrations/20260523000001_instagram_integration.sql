-- Instagram DM integration: contact identifiers + OAuth token storage.
-- Mirrors Gmail pattern (ADR-0006) with Instagram Login scopes.

alter table public.contacts
  add column instagram_username text,
  add column instagram_scoped_id text;

alter table public.user_provider_tokens
  drop constraint user_provider_tokens_provider_valid;

alter table public.user_provider_tokens
  add constraint user_provider_tokens_provider_valid
    check (provider in ('google', 'instagram'));

-- Instagram professional account ID (IG_ID) used as the send endpoint prefix.
alter table public.user_provider_tokens
  add column provider_account_id text;
