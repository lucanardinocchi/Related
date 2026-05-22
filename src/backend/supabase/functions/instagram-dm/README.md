# Instagram DM integration

Read and send Instagram DMs from relationship pages using the [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/).

## Prerequisites

1. **Instagram professional or creator account** — personal accounts are not supported.
2. **Meta Developer App** with Instagram product configured.
3. App permissions (requires App Review for production):
   - `instagram_business_basic`
   - `instagram_business_manage_messages`

## Meta app setup

1. Create an app at [developers.facebook.com](https://developers.facebook.com/).
2. Add the **Instagram** product → **Instagram API with Instagram Login**.
3. Under **Instagram > API setup with Instagram login**, add OAuth redirect URI:
   - Local: `http://localhost:3000/settings/instagram/callback`
   - Production: `https://<your-domain>/settings/instagram/callback`
4. Copy the **Instagram App ID** and **Instagram App Secret**.

## Environment variables

Web (`.env.local`):

```
NEXT_PUBLIC_INSTAGRAM_APP_ID=<instagram-app-id>
```

Supabase Edge Function secrets:

```bash
supabase secrets set INSTAGRAM_APP_ID=<instagram-app-id>
supabase secrets set INSTAGRAM_APP_SECRET=<instagram-app-secret>
```

## Deploy

```bash
supabase db push   # applies instagram_integration migration
supabase functions deploy instagram-oauth
supabase functions deploy instagram-dm
```

## User flow

1. User connects Instagram in **Settings → Integrations**.
2. On a relationship page, add the contact's **Instagram username** in Key details.
3. The **Instagram** section loads the DM thread once the contact has messaged the user's creator account.
4. User can compose replies within Meta's **24-hour messaging window**.

## API limitations

- **No cold outbound DMs** — the contact must message the creator account first; replies are allowed within 24 hours.
- **No native group DMs** — Instagram's API only supports 1:1 conversations.
- **IGSID required to send** — the edge function resolves and stores `instagram_scoped_id` on the contact when a conversation is found.
- **20 message history cap** — Instagram only returns details for the 20 most recent messages per conversation.

## Architecture

```
Settings OAuth → user_provider_tokens (provider=instagram)
       ↓ subscribe messages webhooks (instagram-oauth)
Meta webhook → instagram-webhook → instagram_messages (+ Realtime)
       ↓
InstagramClient → instagram-dm (DB + Graph API backfill / send)
       ↓
_InstagramSection + Comms spine on /relationships/[id]
```
