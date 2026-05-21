# tiktok-dm Edge Function

Lists and sends TikTok DMs for Contacts and Groups via the TikTok Business Messaging API.

## Prerequisites

1. **TikTok for Developers app** with Login Kit and Business Messaging products enabled.
2. **TikTok Business Account** (not a personal account). Business Messaging is currently available outside the EEA, UK, Switzerland, and US.
3. **App review** for Login Kit scopes: `user.info.basic`, `user.info.profile`, plus Business Messaging product access.
4. Register redirect URI: `https://<your-domain>/settings/tiktok/callback`

## Secrets

```bash
supabase secrets set TIKTOK_CLIENT_KEY=...
supabase secrets set TIKTOK_CLIENT_SECRET=...
supabase secrets set TIKTOK_BUSINESS_ID=...   # TikTok Business Account ID
supabase functions deploy tiktok-dm
supabase functions deploy tiktok-oauth
supabase functions deploy tiktok-webhook
```

## Web app env

```
NEXT_PUBLIC_TIKTOK_CLIENT_KEY=...
```

## API limitations

- **48-hour messaging window** — you can only send messages within 48 hours of the contact's last message (Business Messaging policy).
- **No cold outbound DMs** — the contact must message your Business Account first.
- **Group DMs** — supported when a group conversation exists; conversation ID is resolved heuristically from member open IDs.
- **Regional restrictions** — Business Messaging is not available in EEA, UK, CH, or US.
- Messages are **stored in Supabase** (`tiktok_messages`) and synced via webhook + outbound sends. Configure the webhook URL in TikTok Developer Portal:

  `https://<project-ref>.supabase.co/functions/v1/tiktok-webhook`

## Contact setup

Add the contact's TikTok username in Key details. On first message load, the edge function resolves their `open_id` from existing conversations and saves it as `tiktok_open_id`.
