-- Outlook Calendar integration: OAuth token storage and synced events.

alter type public.event_source add value if not exists 'outlook';

alter table public.user_provider_tokens
  drop constraint user_provider_tokens_provider_valid;

alter table public.user_provider_tokens
  add constraint user_provider_tokens_provider_valid
    check (provider in ('google', 'instagram', 'x', 'whatsapp', 'tiktok', 'outlook'));
