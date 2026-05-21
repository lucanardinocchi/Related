# Deploy

Step-by-step to get Related running on Vercel against a hosted Supabase project.

Per [ADR-0007](adr/0007-split-web-mobile-frontends.md): the **web** surface (Next.js 15 in `src/web/`) deploys to Vercel and exposes Sign-in / Onboarding's Connect Calendar / User Context editor / Talk to Claude. The **mobile** surface (Expo in `src/mobile/`) is the iOS app and ships through Xcode + the App Store (Tier 4).

## Tier 0 — minimum smoke test (~20 min)

Just enough to sign up, sign in, and land on the Context editor on web.

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
2. **Framework Preset:** Next.js (auto-detected from `vercel.json`).
3. The `vercel.json` at the repo root sets `buildCommand`, `outputDirectory`, and `framework: nextjs` to build `@related/web`. Don't override.
4. **Environment Variables:**
   - `NEXT_PUBLIC_SUPABASE_URL` = the URL from 0.1
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon key from 0.1
5. Deploy.

First deploy takes ~3 minutes (Next.js compile + npm install for the workspace). Subsequent deploys are faster because Vercel caches `node_modules` and `.next/cache`.

### 0.4 Smoke test

Open the Vercel URL. You'll land on `/sign-in`. Create an account via `/sign-up`. You'll be redirected through `/onboarding` (where you can skip Calendar for now) to `/context`. Add a Goal, save Situational State.

**What works at Tier 0:** sign-up / sign-in, the User Context editor (Goals & Values + Situational State), navigation between `/context` / `/talk` / `/onboarding` in the sidebar.

**What's broken:**
- `/talk` — the agent calls the `engaged-pass` Edge Function which isn't deployed yet. Move to Tier 1.
- `/onboarding` → Connect Calendar — relies on Google OAuth + the `sync-calendar` Edge Function. Move to Tier 2.

## Tier 1 — agent works (~10 more min)

Adds the AI agent's voice-mode chat at `/talk`.

### 1.1 Deploy `engaged-pass` Edge Function

```sh
cd src/backend
supabase secrets set ANTHROPIC_API_KEY=sk-ant-…
supabase functions deploy engaged-pass
```

Done. Refresh the Vercel URL → `/talk` → pick a Relationship → press mic → speak → Claude responds with typed Candidate Actions.

Voice requires Tier 3 secrets too — without them the STT/TTS adapters error. If you only want text-mode Engaged Pass for now, that's fine: you can type into the transcript stub. Otherwise jump to Tier 3.

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

Refresh. Now `/onboarding` → Connect Calendar works end-to-end; the daily cron pulls real events.

## Tier 3 — Voice (~15 min)

```sh
supabase secrets set OPENAI_API_KEY=sk-…
supabase secrets set ELEVENLABS_API_KEY=<from elevenlabs.io>
supabase secrets set ELEVENLABS_DEFAULT_VOICE_ID=21m00Tcm4TlvDq8ikWAM
supabase functions deploy voice-stt voice-tts
```

`/talk` mic now works end-to-end (browser `MediaRecorder` → Whisper STT → Claude (Sonnet, via `engaged-pass`) → ElevenLabs TTS). The same `voice-stt` is also used by the `/agent` Conversational Intelligence composer (Tier 3.1).

## Tier 3.1 — Conversational Intelligence + Extraction Pass (~5 min)

The `/agent` Chat surface (per [ADR-0009](adr/0009-three-agent-architecture.md)) ships two new Edge Functions:

```sh
# ANTHROPIC_API_KEY was already set in Tier 1 via engaged-pass; both new
# functions reuse it.
supabase functions deploy chat-respond extract-context
```

- `chat-respond` — Conversational Intelligence agent. Runs a multi-round tool-use loop with the read-only tool surface (Relationships, Contacts, Open Threads, Interactions, Calendar, Groups, User Context). **Streams responses as Server-Sent Events** (`text/event-stream`) — `tool_use`, `tool_result`, `text_delta`, `done`, and `error` events arrive incrementally so the UI can render Claude's reply token-by-token. Web's `_AgentView.tsx` and mobile's `MobileChatScreen.tsx` both consume the stream via `chatsClient.respondStream(chatId)`. See [`src/backend/supabase/functions/chat-respond/README.md`](../src/backend/supabase/functions/chat-respond/README.md).
- `extract-context` — Extraction Pass. Triggered after the User closes a Chat. Writes to `situational_state` (replace) and `transient_intent` (append, 7-day decay). Idempotent — gates on `chats.extracted_at`. See [`src/backend/supabase/functions/extract-context/README.md`](../src/backend/supabase/functions/extract-context/README.md).

Apply the schema first:

```sh
supabase db push
```

…which runs both new migrations:

- `20260521000001_chats_messages.sql` — `chats` + `chat_messages` tables with owner-only RLS.
- `20260521000002_chats_extracted_at.sql` — Extraction idempotency stamp.

## Tier 3.2 — Mobile Conversational surface

Per the [ADR-0009 mobile amendment](adr/0009-three-agent-architecture.md), the Conversational Intelligence Chat tab ships on mobile alongside web. The Chat tab is wired into `AuthedApp`'s bottom-tab navigator and hits the **same** `chat-respond` / `extract-context` Edge Functions and **same** `chats` / `chat_messages` tables — multi-tenant isolation flows from Supabase RLS, so a User's Chats sync across web and mobile for the same account.

Native voice capture and TTS auto-playback are wired through `expo-audio` + `expo-file-system`:

- `src/mobile/src/voice/createMobileMicCapture.ts` — binds `AudioModule.AudioRecorder` to the platform-agnostic adapter contract from `ExpoAudioRecorder.ts`.
- `src/mobile/src/voice/createMobileAudioPlayer.ts` — implements the shared `AudioPlayer` port using `createAudioPlayer` against a temp file in `Paths.cache/tts/`.
- `src/mobile/App.tsx` constructs both, gates them behind `Platform.OS === 'ios' || 'android'` (text-only on Expo Web for now), and threads them through `AuthGate` → `AuthedApp` → `MobileChatScreen`.

Microphone permission is configured via the `expo-audio` config plugin in `src/mobile/app.json` — Expo prompts on first mic use with the message:

> "Related uses your microphone so you can talk to the agent and have your context captured automatically."

If you change Expo SDK or add other native modules, regenerate the iOS / Android binaries:

```sh
cd src/mobile
npx expo prebuild        # if using bare workflow / EAS Build
# or rebuild with EAS:
eas build --platform ios
```

For day-to-day development with Expo Go, no rebuild needed — `expo-audio` is included.

## Tier 4 — iOS native (HealthKit, push, App Store)

Out of Vercel's scope — this is the **mobile** workspace (`src/mobile/`, Expo) and needs a Mac with Xcode and an Apple Developer account ($99/yr).

Mobile env vars use the `EXPO_PUBLIC_` prefix (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) in `src/mobile/.env`. They point at the same Supabase project as web's `NEXT_PUBLIC_` vars.

See:
- [`src/mobile/modules/healthkit/README.md`](../src/mobile/modules/healthkit/README.md) for the HealthKit native build steps
- The App Store readiness checklist (Sign in with Apple, privacy policy, microphone consent) tracked separately

## Seeding demo data for a User

To wipe and re-seed the full domain dataset for a signed-up account (default: `lucanardinocchi@gmail.com`):

```sh
cd src/backend
SUPABASE_URL="https://<ref>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service_role>" \
SUPABASE_ANON_KEY="<anon>" \
node scripts/seed-user.mjs
```

The script clears all `owner_id`-scoped rows for that User, then inserts contacts, groups, relationships (with role/cadence), interactions, open threads, user context, inferred signals, candidate sets, chats, and onboarding state. Interactions and open threads use the User's RPCs (`create_interaction`, `create_open_thread`) so Postgres constraint triggers pass in a single transaction.

Optional: `SEED_EMAIL=other@example.com` or `SEED_CLEAR_ONLY=1` (wipe only).

## Troubleshooting

**"Missing NEXT_PUBLIC_SUPABASE_URL" at build time** — env vars must be set in Vercel BEFORE the build runs. Set them, then trigger a redeploy. (The env helpers in `src/web/lib/supabase/*` defer the check to call time so `next build` itself doesn't require secrets, but the deployed app does.)

**Sign-in redirects to localhost** — Supabase Auth URL Configuration redirect allowlist doesn't include your Vercel URL. Add it.

**OAuth "Google hasn't verified this app"** — until you submit Google's OAuth verification (separate from App Store), only emails listed as test users in the OAuth consent screen can sign in. Add yours.

**`engaged-pass` returns 401** — your ANTHROPIC_API_KEY is set as a Supabase secret but the function was deployed before the secret existed. Re-deploy the function (`supabase functions deploy engaged-pass`).

**Migration push fails on a particular file** — the migration was probably already applied. `supabase migration list --linked` shows the state.
