# whatsapp-dm

Lists and sends WhatsApp DMs for Contacts and Groups via the WhatsApp Business Cloud API. Message history is read from `whatsapp_messages` (populated by `whatsapp-webhook` and outbound sends).

## Secrets

- `WHATSAPP_APP_ID`
- `WHATSAPP_APP_SECRET`

## Deploy

```sh
supabase secrets set WHATSAPP_APP_ID=...
supabase secrets set WHATSAPP_APP_SECRET=...
supabase functions deploy whatsapp-dm
```
