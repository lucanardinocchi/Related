-- X (Twitter) DM integration: contact identifiers, group conversation link, OAuth tokens.

alter table public.contacts
  add column x_username text,
  add column x_user_id text;

alter table public.groups
  add column x_dm_conversation_id text;

alter table public.user_provider_tokens
  drop constraint user_provider_tokens_provider_valid;

alter table public.user_provider_tokens
  add constraint user_provider_tokens_provider_valid
    check (provider in ('google', 'instagram', 'x'));
