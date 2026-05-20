# Deploy

Step-by-step to get Related running on Vercel against a hosted Supabase project.

## Tier 0 — minimum smoke test (~20 min)

Just enough to sign up, click through onboarding, see Home, and add a Contact. The agent / voice / Calendar / Sleep are all skip-able from Onboarding, so this tier is genuinely usable for a UI sanity check.

### 0.1 Hosted Supabase project

1. Go to https://supabase.com → New project.
2. Pick a region close to you. Strong DB password (save it to 1Password — Supabase shows it once).
3. Wait ~2 minutes for provisioning.
4. Project Settings → API → copy:
   - **Project URL** (`https://<ref>.supabase.co`)
   - **anon public** key (the long JWT under "Project API keys")

### 0.2 Apply migrations to the hosted DB

```sh
# From the repo root.
cd src/backend
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

That replays every migration in `src/backend/supabase/migrations/` against the hosted DB. RLS policies, schemas, RPCs all applied.

### 0.3 Vercel project

1. https://vercel.com → Add New → Project → import your GitHub repo.
2. **Framework Preset:** Other.
3. The `vercel.json` at the repo root already sets `buildCommand`, `outputDirectory`, and the SPA rewrite. Don't override.
4. **Environment Variables:**
   - `EXPO_PUBLIC_SUPABASE_URL` = the URL from 0.1
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` = the anon key from 0.1
5. Deploy.

First deploy will take ~3 minutes (npm install pulls 1000+ packages for the Expo monorepo). Subsequent deploys are faster because Vercel caches `node_modules`.

### 0.4 Smoke test

Open the Vercel URL. Sign up with email + password. Click Skip through every onboarding step. You should land on Home.

**What works at Tier 0:** sign-up / sign-in, all CRUD (Contacts, Relationships, Open Threads, Interactions, Groups, Calendar view), the You/settings screen.

**What's broken:** "Talk to Claude" — the agent calls `engaged-pass` Edge Function which isn't deployed yet. Move to Tier 1 to fix.

## Tier 1 — agent works (~10 more min)

Adds the AI agent's text-mode chat.

### 1.1 Deploy `engaged-pass` Edge Function

```sh
cd src/backend
supabase secrets set ANTHROPIC_API_KEY=sk-ant-…
supabase functions deploy engaged-pass
```

Done. Refresh the Vercel URL. The "Talk to Claude" button on Home → pick a Relationship → type a message → Claude responds with typed Candidate Actions.

## Tier 2 — Calendar OAuth (~20 min, mostly Google Cloud setup)

### 2.1 Google Cloud OAuth client

1. https://console.cloud.google.com → new project (or existing).
2. APIs & Services → Library → enable **Google Calendar API**.
3. APIs & Services → OAuth consent screen → External → fill basics. Add `auth/calendar.readonly` to scopes. Add your email as a test user (until verified, only test users can sign in).
4. APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application.
5. Authorised redirect URIs: `https://<your-supabase-ref>.supabase.co/auth/v1/callback`.
6. Save the **Client ID** + **Client Secret**.

### 2.2 Supabase Auth → Google provider

Dashboard → Authentication → Providers → Google → toggle on. Paste Client ID + Secret. Save.

### 2.3 Auth URL Configuration

Dashboard → Authentication → URL Configuration → Redirect URLs → add your Vercel URL (production + preview).

### 2.4 Deploy `sync-calendar` Edge Function

```sh
supabase secrets set GOOGLE_OAUTH_CLIENT_ID=<from 2.1>
supabase secrets set GOOGLE_OAUTH_CLIENT_SECRET=<from 2.1>
supabase functions deploy sync-calendar
```

Refresh. Now Onboarding → Connect calendar works end-to-end; the daily cron pulls real events.

## Tier 3 — Voice (~15 min)

```sh
supabase secrets set OPENAI_API_KEY=sk-…
supabase secrets set ELEVENLABS_API_KEY=<from elevenlabs.io>
supabase secrets set ELEVENLABS_DEFAULT_VOICE_ID=21m00Tcm4TlvDq8ikWAM
supabase functions deploy voice-stt voice-tts
```

Voice mic toggle on AgentScreen now works in browsers (Web `MediaRecorder` → Whisper → ElevenLabs).

## Tier 4 — iOS native (HealthKit, push, App Store)

Out of Vercel's scope — this needs a Mac with Xcode and an Apple Developer account ($99/yr). See:
- [`src/frontend/modules/healthkit/README.md`](../src/frontend/modules/healthkit/README.md) for the HealthKit native build steps
- The App Store readiness checklist (Sign in with Apple, privacy policy, microphone consent) tracked separately

## Troubleshooting

**"Missing EXPO_PUBLIC_SUPABASE_URL" at build time** — env vars must be set in Vercel BEFORE the build runs. Set them, then trigger a redeploy.

**Sign-in redirects to localhost** — Supabase Auth URL Configuration redirect allowlist doesn't include your Vercel URL. Add it.

**OAuth "Google hasn't verified this app"** — until you submit Google's OAuth verification (separate from App Store), only emails listed as test users in the OAuth consent screen can sign in. Add yours.

**`engaged-pass` returns 401** — your ANTHROPIC_API_KEY is set as a Supabase secret but the function was deployed before the secret existed. Re-deploy the function (`supabase functions deploy engaged-pass`).

**Migration push fails on a particular file** — the migration was probably already applied. `supabase migration list --linked` shows the state.
