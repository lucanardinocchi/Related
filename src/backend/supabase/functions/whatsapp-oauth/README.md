# whatsapp-oauth

Exchanges Meta OAuth authorization codes for WhatsApp Business Cloud API tokens and stores the linked **phone number ID** in `user_provider_tokens.provider_account_id`.

## Secrets

- `WHATSAPP_APP_ID`
- `WHATSAPP_APP_SECRET`

## Deploy

```sh
supabase secrets set WHATSAPP_APP_ID=...
supabase secrets set WHATSAPP_APP_SECRET=...
supabase functions deploy whatsapp-oauth
```
