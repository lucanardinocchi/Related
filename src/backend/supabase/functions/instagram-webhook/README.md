# instagram-webhook

Receives Meta **Instagram `messages`** webhooks and stores inbound (and echo) DMs in `instagram_messages`. The web app subscribes via Supabase Realtime for live UI updates.

## Secrets

```bash
supabase secrets set INSTAGRAM_VERIFY_TOKEN=<random-string-you-choose>
# INSTAGRAM_APP_SECRET already used for OAuth — also verifies X-Hub-Signature-256
supabase functions deploy instagram-webhook --no-verify-jwt
```

## Meta App Dashboard

1. Add product **Webhooks** (if not already on the app).
2. **Callback URL:** `https://yawclybcwwtrrnuyotdm.supabase.co/functions/v1/instagram-webhook`
3. **Verify token:** same value as `INSTAGRAM_VERIFY_TOKEN`.
4. Subscribe to object **Instagram** (or **Page** if using linked Page routing) → field **`messages`**.
5. Click **Verify and save**.

On **Connect Instagram** in Related, `instagram-oauth` calls `POST /{ig-user-id}/subscribed_apps?subscribed_fields=messages` so your account receives events.

## Migration

```bash
supabase db push   # 20260533000001_instagram_messages.sql
```

## Re-subscribe after connect

If webhooks were configured before OAuth connect, open **Settings → Connect Instagram** again (or call `subscribed_apps` manually) so Meta attaches the subscription to your IG professional account.

## Limitations

- Meta may require the app to be **Live** for production webhooks; in **Development**, use **Instagram Testers** and the dashboard **Test** button on the `messages` field.
- Inbound messages only link to contacts that already have `instagram_scoped_id`, or exactly one contact with an `instagram_username` on file.
