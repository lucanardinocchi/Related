# Platform stack: Expo + Supabase + Expo Push / Web Push + Supabase Auth

The app ships as a single Expo / React Native codebase targeting iOS, Android, and web simultaneously (Expo web target via React Native Web). Backend is Supabase (Postgres, Auth, Edge Functions, Realtime, Storage). Notifications use Expo Push on mobile and Web Push on web. Auth is Supabase Auth. Notifications are in v1 scope.

## Considered options

- **Three separate codebases** (native iOS, native Android, separate web). Rejected: 3× the work for early-stage shipping; the platform-specific quality gains are not worth the maintenance compounding for a small team.
- **Web-first PWA** (single codebase, mobile via PWA install). Rejected: PWA cannot reliably deliver the always-on agent loop infrastructure, low-latency voice, HealthKit access, or robust notifications — all of which are core to Ambient Intelligence.
- **Mobile-only for v1, web deferred.** Rejected: web is part of the product brief (review surfaces, glance access). RN Web inside Expo gets it cheaply enough to include now.
- **Separate backend stack** (e.g., Node + Postgres + a scheduler like Temporal). Rejected for v1: Supabase covers Postgres + Auth + scheduled jobs (pg_cron) + Realtime in one managed surface. The Ambient Intelligence loop is the only awkward fit, and it's solvable with Edge Functions + pg_cron (Baseline) and Postgres triggers/NOTIFY (Triggered).

## Why

A single codebase across iOS/Android/web is the only economic shape for early-stage shipping speed without sacrificing the mobile-only signals (HealthKit, native push) that the agent loop depends on. Supabase consolidates the data, auth, and scheduling surfaces; the Ambient Intelligence loop is the only piece that requires custom plumbing on top.

## Consequences

- Web is informationally a degraded experience for the Inferred Signals layer (no HealthKit access). Accepted: web is a companion surface, not the primary one.
- Background processing for the agent loop runs on the Supabase side (Edge Functions + pg_cron + Postgres triggers), not on-device. The mobile/web clients are presentation + voice/input only.
- Migrating off Supabase later would touch every layer of the stack. Accepted as a v1 trade-off for shipping speed.
- Android sleep support (Health Connect / Google Fit) is deferred; iOS-first for the Sleep Inferred Signal in v1.
