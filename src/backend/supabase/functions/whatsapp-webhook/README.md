# whatsapp-webhook

Meta webhook endpoint for inbound WhatsApp messages. Stores messages in `whatsapp_messages` and links them to Contacts and Groups by phone number / group ID.

## Secrets

- `WHATSAPP_VERIFY_TOKEN` — arbitrary string you choose; must match Meta webhook config

## Deploy

```sh
supabase secrets set WHATSAPP_VERIFY_TOKEN=your-random-token
supabase functions deploy whatsapp-webhook --no-verify-jwt
```

## Meta configuration

In the Meta Developer Console → WhatsApp → Configuration:

- **Callback URL:** `https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook`
- **Verify token:** same value as `WHATSAPP_VERIFY_TOKEN`
- Subscribe to **messages** field
