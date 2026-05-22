# Messaging platform OAuth setup

Connect Instagram, WhatsApp, X, and TikTok from **Settings → Integrations** on web. Each platform uses a custom OAuth flow (not Supabase Auth): the browser redirects to the provider, returns to `/settings/<platform>/callback`, and an Edge Function exchanges the code and stores tokens in `user_provider_tokens`.

**Hosted project:** `yawclybcwwtrrnuyotdm`  
**Production web:** `https://related-sooty.vercel.app`  
**Local web:** `http://127.0.0.1:3000`

> **Not covered here:** Sign-in with Google/Apple ([DEPLOY.md](./DEPLOY.md) §2). **iMessage/SMS** uses the Mac relay ([DEPLOY.md](./DEPLOY.md) Tier 5) — no Meta/X/TikTok OAuth.

---

## Quick reference

| Platform | Web env (public) | Supabase secrets | OAuth redirect (register at provider) | Webhook (inbound sync) |
|----------|------------------|------------------|----------------------------------------|-------------------------|
| Instagram | `NEXT_PUBLIC_INSTAGRAM_APP_ID` | `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_VERIFY_TOKEN` | `/settings/instagram/callback` | `…/functions/v1/instagram-webhook` |
| WhatsApp | `NEXT_PUBLIC_WHATSAPP_APP_ID` | `WHATSAPP_APP_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | `/settings/whatsapp/callback` | `…/functions/v1/whatsapp-webhook` |
| X | `NEXT_PUBLIC_X_CLIENT_ID` | `X_CLIENT_ID`, `X_CLIENT_SECRET` | `/settings/x/callback` | — |
| TikTok | `NEXT_PUBLIC_TIKTOK_CLIENT_KEY` | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_BUSINESS_ID` | `/settings/tiktok/callback` | `…/functions/v1/tiktok-webhook` |

Register **both** redirect URIs at each provider when you test locally and in production:

```
http://127.0.0.1:3000/settings/<platform>/callback
https://related-sooty.vercel.app/settings/<platform>/callback
```

---

## 1. Web + Vercel env (client IDs only)

Copy into `src/web/.env.local` and Vercel → Environment Variables (same names). These are **public** — they only start the OAuth redirect.

```env
NEXT_PUBLIC_INSTAGRAM_APP_ID=
NEXT_PUBLIC_WHATSAPP_APP_ID=
NEXT_PUBLIC_X_CLIENT_ID=
NEXT_PUBLIC_TIKTOK_CLIENT_KEY=
```

Redeploy Vercel after changing. Restart `npm run dev` locally.

---

## 2. Supabase secrets + deploy

From `src/backend` (project already linked to `yawclybcwwtrrnuyotdm`):

```sh
cd src/backend

# Set secrets as you obtain them (never commit values)
supabase secrets set INSTAGRAM_APP_ID=...
supabase secrets set INSTAGRAM_APP_SECRET=...
supabase secrets set INSTAGRAM_VERIFY_TOKEN=...   # you choose; Meta webhook verify token

supabase secrets set WHATSAPP_APP_ID=...
supabase secrets set WHATSAPP_APP_SECRET=...
supabase secrets set WHATSAPP_VERIFY_TOKEN=...   # you choose this string

supabase secrets set X_CLIENT_ID=...
supabase secrets set X_CLIENT_SECRET=...

supabase secrets set TIKTOK_CLIENT_KEY=...
supabase secrets set TIKTOK_CLIENT_SECRET=...
supabase secrets set TIKTOK_BUSINESS_ID=...      # after Business Messaging is approved

# OAuth token exchange
supabase functions deploy instagram-oauth whatsapp-oauth x-oauth tiktok-oauth

# DM read/send
supabase functions deploy instagram-dm whatsapp-dm x-dm tiktok-dm

# Inbound message webhooks (no JWT — Meta/TikTok call these directly)
supabase functions deploy instagram-webhook whatsapp-webhook tiktok-webhook --no-verify-jwt
```

`db push` if you have not applied messaging migrations yet:

```sh
supabase db push
```

---

## 3. Instagram

**Account:** Instagram **professional** or **creator** (personal accounts cannot use the Messaging API).

**Meta app:** [developers.facebook.com](https://developers.facebook.com) → Create app → add **Instagram** → **Instagram API with Instagram Login**.

1. **Instagram → API setup with Instagram login** → Valid OAuth redirect URIs:
   - `http://127.0.0.1:3000/settings/instagram/callback`
   - `https://related-sooty.vercel.app/settings/instagram/callback`
2. Copy **Instagram App ID** → `NEXT_PUBLIC_INSTAGRAM_APP_ID` and `INSTAGRAM_APP_ID`.
3. Copy **Instagram App Secret** → `INSTAGRAM_APP_SECRET` (Supabase only).
4. **App Review** (for production): request
   - `instagram_business_basic`
   - `instagram_business_manage_messages`
5. Add yourself as a **tester** on the app until review completes.

**Webhooks (live DMs):**

| Field | Value |
|-------|--------|
| Product | **Webhooks** on the Meta app |
| Callback URL | `https://yawclybcwwtrrnuyotdm.supabase.co/functions/v1/instagram-webhook` |
| Verify token | Same as `INSTAGRAM_VERIFY_TOKEN` |
| Subscription | Object **Instagram** → field **`messages`** |

Reconnect Instagram in Settings after configuring webhooks so `instagram-oauth` subscribes your IG account via `subscribed_apps`.

**Test:** Settings → Connect Instagram → relationship page → add contact **Instagram username** → send a DM to your creator account → message appears without refresh (Realtime). API backfill still runs on first open.

See [`instagram-webhook/README.md`](../src/backend/supabase/functions/instagram-webhook/README.md).

See [`instagram-dm/README.md`](../src/backend/supabase/functions/instagram-dm/README.md).

---

## 4. WhatsApp (Meta Business Cloud)

Uses the same Meta Developer account; often the **same app** as Instagram with the **WhatsApp** product added.

1. Meta app → **Add product** → **WhatsApp** → **API Setup**.
2. Create / link a **WhatsApp Business Account** and a **phone number** (test number provided in dev mode).
3. **Facebook Login** or **WhatsApp** OAuth settings → Valid OAuth redirect URIs:
   - `http://127.0.0.1:3000/settings/whatsapp/callback`
   - `https://related-sooty.vercel.app/settings/whatsapp/callback`
4. App ID → `NEXT_PUBLIC_WHATSAPP_APP_ID` and `WHATSAPP_APP_ID`.
5. App Secret → `WHATSAPP_APP_SECRET`.

**Webhook** (required for inbound messages):

| Field | Value |
|-------|--------|
| Callback URL | `https://yawclybcwwtrrnuyotdm.supabase.co/functions/v1/whatsapp-webhook` |
| Verify token | Same string as `WHATSAPP_VERIFY_TOKEN` secret |
| Subscribed fields | `messages` (and related message events you need) |

**Test:** Connect in Settings → add contact **phone** on relationship page → inbound messages via webhook; outbound via `whatsapp-dm`.

See [`whatsapp-oauth/README.md`](../src/backend/supabase/functions/whatsapp-oauth/README.md).

---

## 5. X (Twitter) DMs

1. [Developer Portal](https://developer.x.com/) → Project + App → **User authentication settings** → enable **OAuth 2.0**.
2. Type of App: **Web App** (confidential client if you have a client secret).
3. **Callback URLs:**
   - `http://127.0.0.1:3000/settings/x/callback`
   - `https://related-sooty.vercel.app/settings/x/callback`
4. **Scopes:** `dm.read`, `dm.write`, `users.read`, `tweet.read`, `offline.access`
5. Client ID → `NEXT_PUBLIC_X_CLIENT_ID` and `X_CLIENT_ID`.
6. Client Secret → `X_CLIENT_SECRET`.

X may require **paid API access** for DM endpoints depending on your developer tier. Add your account as a test user while in development.

**Test:** Settings → Connect X → add contact **X username** on relationship page.

---

## 6. TikTok Business Messaging

Hardest setup: Business account, Login Kit, Business Messaging product, and regional limits (not available in US/EEA/UK/CH per product docs).

1. [TikTok for Developers](https://developers.tiktok.com/) → Create app.
2. Enable **Login Kit** and **Business Messaging**.
3. Redirect URI:
   - `http://127.0.0.1:3000/settings/tiktok/callback`
   - `https://related-sooty.vercel.app/settings/tiktok/callback`
4. Client key → `NEXT_PUBLIC_TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_KEY`.
5. Client secret → `TIKTOK_CLIENT_SECRET`.
6. After Business Messaging is approved, copy **Business Account ID** → `TIKTOK_BUSINESS_ID`.

**Webhook:**

```
https://yawclybcwwtrrnuyotdm.supabase.co/functions/v1/tiktok-webhook
```

**Test:** Settings → Connect TikTok → add **TikTok username** on relationship page. 48-hour reply window; contact must message your business account first.

See [`tiktok-dm/README.md`](../src/backend/supabase/functions/tiktok-dm/README.md).

---

## 7. Recommended order

1. **Instagram** — one Meta app, good for creator DMs, documented in-repo.
2. **WhatsApp** — extend the same Meta app; add webhook + test number.
3. **X** — if you have API tier with DM access.
4. **TikTok** — when you have a Business account and messaging product approval.

---

## 8. Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Connect button missing in Settings | Missing `NEXT_PUBLIC_*` in `.env.local` / Vercel |
| Redirect works, callback shows error | Edge function not deployed or wrong `*_APP_SECRET` |
| Instagram “permissions” error | Scopes not approved / user not app tester |
| WhatsApp connected but no inbound messages | Webhook URL or `WHATSAPP_VERIFY_TOKEN` mismatch |
| X PKCE error | Opened callback in new tab; reconnect from Settings (verifier in sessionStorage) |
| TikTok connects but no DMs | Missing `TIKTOK_BUSINESS_ID` or Business Messaging not approved |

Check Edge Function logs:

```sh
cd src/backend
supabase functions logs instagram-oauth --tail
```

---

## 9. Checklist (copy into your notes)

- [ ] Meta app created (Instagram + optional WhatsApp)
- [ ] X Developer app with OAuth 2.0 + DM scopes
- [ ] TikTok app with Login Kit (+ Business Messaging when ready)
- [ ] All redirect URIs registered (local + production)
- [ ] `src/web/.env.local` + Vercel `NEXT_PUBLIC_*` set
- [ ] Supabase secrets set
- [ ] OAuth + DM + webhook functions deployed
- [ ] WhatsApp webhook verified in Meta console
- [ ] Smoke test: Settings → Connect → relationship page DM section
