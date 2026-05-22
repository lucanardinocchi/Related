# WhatsApp setup (Related app)

Uses the same Meta app as Instagram (**Related**, App ID `1443359060811831` for WhatsApp / Facebook Login).

> Instagram Login uses a **separate Instagram App ID** (Meta → Instagram → API setup with Instagram login). Do not reuse `1443359060811831` for `NEXT_PUBLIC_INSTAGRAM_APP_ID`.

## 1. Meta Developer Console

### Add WhatsApp product

1. [developers.facebook.com/apps](https://developers.facebook.com/apps/) → **Related**
2. **Use cases** → add **WhatsApp** (or open **WhatsApp** in the sidebar)
3. **API Setup** → complete **WhatsApp Business Account** (WABA) and add a **phone number**
   - Dev mode includes a Meta **test number** you can message from your personal WhatsApp

### Facebook Login redirect URIs (required for Connect)

WhatsApp OAuth uses **Facebook Login**, not Instagram Login.

**Facebook Login for Business** → **Settings** → **Valid OAuth Redirect URIs**:

```
http://127.0.0.1:3000/settings/whatsapp/callback
https://related-sooty.vercel.app/settings/whatsapp/callback
```

### Webhook (inbound messages — live sync)

**WhatsApp** → **Configuration** (or **Webhooks**):

| Field | Value |
|-------|--------|
| Callback URL | `https://yawclybcwwtrrnuyotdm.supabase.co/functions/v1/whatsapp-webhook` |
| Verify token | `related-wa-webhook-verify` (must match Supabase secret) |
| Subscribe | **messages** |

Click **Verify and save**.

## 2. Related / Supabase (already configured if you ran deploy)

**Web** (`src/web/.env.local`):

```env
NEXT_PUBLIC_WHATSAPP_APP_ID=1443359060811831
```

**Supabase secrets:**

```sh
cd src/backend
supabase secrets set WHATSAPP_APP_ID=1443359060811831
supabase secrets set WHATSAPP_APP_SECRET=<Meta App Secret from Basic settings>
supabase secrets set WHATSAPP_VERIFY_TOKEN=related-wa-webhook-verify
supabase functions deploy whatsapp-oauth whatsapp-dm
supabase functions deploy whatsapp-webhook --no-verify-jwt
```

`WHATSAPP_APP_SECRET` is the same **App secret** as on **App settings → Basic** (same value as `INSTAGRAM_APP_SECRET`).

## 3. Test in Related

1. Restart web dev: `cd src/web && npm run dev`
2. **Settings → Integrations → Connect WhatsApp** (Facebook consent → back to Settings → **Connected**)
3. Open a **relationship** → **Key details** → add contact **phone** (E.164, e.g. `+61412345678`)
4. **WhatsApp** section or **Comms** — send a message from your phone to the business test number; it should appear live via webhook

## Troubleshooting

| Error | Fix |
|-------|-----|
| Connect button missing | Set `NEXT_PUBLIC_WHATSAPP_APP_ID` in `.env.local` / Vercel |
| `WhatsApp app credentials not configured` | Set `WHATSAPP_APP_ID` + `WHATSAPP_APP_SECRET` in Supabase |
| `No WhatsApp Business phone number found` | Finish WABA + phone in Meta **WhatsApp → API Setup** |
| OAuth redirect mismatch | Add exact callback URLs under **Facebook Login** settings |
| Inbound messages missing | Verify webhook URL + token; subscribe to **messages** |
| Contact not linked | Phone on contact must match sender (digits); check `whatsapp_messages` in Supabase |

Logs: `supabase functions logs whatsapp-oauth --tail` or `whatsapp-webhook --tail`
