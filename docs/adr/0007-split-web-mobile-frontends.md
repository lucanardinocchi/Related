# Split web and mobile into separate frontend workspaces

The frontend is split into two workspaces with different product roles. `src/mobile/` (renamed from `src/frontend/`) stays as the Expo / React Native app, iOS-primary per ADR-0006, and carries the full ambient surface: HealthKit, in-pocket voice, push, and the complete CRUD over Contacts / Relationships / Groups / Open Threads / Interactions / Calendar / Candidate Actions. `src/web/` is a new Next.js 15 App Router workspace with a narrow, web-first feature set: Sign-in/up, the Connect Calendar onboarding step, User Context editing (Goals & Values + Situational State), and the Voice agent (browser `MediaRecorder` → existing `voice-stt` / `voice-tts` Edge Functions). `src/shared/` and `src/backend/` are unchanged.

## Considered options

- **Single Expo codebase with responsive layouts** (Platform.OS branches + useWindowDimensions). Rejected: the Expo web export felt cramped on a wide browser window and could not naturally express desktop IA (sidebar nav, multi-column) without large platform branches throughout the tree. Also doesn't accommodate the genuine feature-set divergence between web and mobile.
- **Per-screen `.web.tsx` / `.native.tsx` variants under Metro.** Rejected: works for a handful of screens with shared logic but different layouts; doesn't support different navigation/IA models or genuinely different feature sets.
- **Web stack: Vite + React Router** instead of Next.js. Rejected: simpler and lighter, but Next.js App Router is the native fit for Vercel (the existing deploy target), has file-based routing out of the box, and `@supabase/ssr` has first-class App Router cookie-based auth support.
- **Web stack: Remix.** Rejected: nice loader/action fit for Supabase but a smaller ecosystem than Next.js.

## Why

Web's product role is genuinely different from mobile's — it's the reflective surface (sit-down editing of User Context, a focused Voice-with-Claude session), not a smaller version of the same app. `@related/shared` already exports everything as framework-agnostic clients (AuthClient, UserContextClient, AgentService, VoiceSessionManager, OpenAI/ElevenLabs adapters), so the split is cheap: no domain-logic duplication, just two presentation layers over the same integration boundary.

## Consequences

- **ADR-0005 is partially superseded.** The "single Expo codebase across iOS/Android/web" framing is narrowed: iOS (and eventually Android) remain a single Expo codebase in `src/mobile/`; web is now a separate Next.js workspace in `src/web/`. The Supabase / Auth / Push / Edge Function decisions in ADR-0005 are unchanged.
- **`@related/shared` is now load-bearing as the integration boundary.** Anything that touches Supabase, Anthropic, OpenAI, or ElevenLabs lives there and is consumed by both apps. New domain logic added in only one app should be flagged for moving to shared.
- **Deploy reorients to the Next.js app.** `vercel.json` switches from building the Expo web export (`src/mobile/dist`) to building the Next.js app in `src/web/`. Mobile no longer has a web build target. `docs/DEPLOY.md` Tier 0 reorients to "open the Vercel URL → web app (User Context + Talk)"; Tier 4 (iOS) becomes the mobile-specific deploy.
- **Env vars double up by prefix.** Mobile keeps `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Web adds `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Next.js requires the `NEXT_PUBLIC_` prefix to expose to the browser bundle). Both prefixes point at the same Supabase project; the user sets both in Vercel.
- **E2E tests reorient.** Playwright (currently configured to serve `src/mobile/dist` and exercise the Expo web bundle) will reorient against the Next.js app in a follow-up commit. Mobile keeps its jest unit tests in `src/mobile/`.
- **No cross-app feature drift in v1.** The web feature set above (Auth, Connect Calendar, User Context editor, Voice agent) is the agreed scope; mobile's broader CRUD surface is intentionally NOT being added to web.
