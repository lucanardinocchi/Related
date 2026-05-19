# Multi-tenant architecture

Related v1 is a multi-tenant SaaS — each authenticated User has their own isolated dataset, OAuth-bound external integrations (Google Calendar), and platform-permissioned signals (HealthKit on iOS). Earlier ADRs and the original PRD framed the app as single-user; this ADR supersedes that framing for the platform / data / auth layers without changing the per-User domain shape.

The User-facing experience is still single-User-per-account (no shared Relationships, no collaborative Groups). What changes is that the *system* now serves N Users concurrently, with hard isolation between them.

## Considered options

- **Single-user-per-deploy** (the PRD's original framing — each User runs their own Supabase project + their own Vercel deploy). Rejected: doesn't scale to App Store distribution; every onboarding would require a tech-savvy user to provision infra.
- **Multi-tenant via shared Supabase with RLS** (chosen). Each User authenticates via Supabase Auth; every row in every table carries `owner_id`; every RLS policy gates by `owner_id = auth.uid()`. External integrations (Google Calendar, HealthKit) are per-User credentials stored alongside the User's data.
- **Multi-tenant via per-User schema** (a Postgres schema per User). Rejected: operational complexity scales poorly; backups, migrations, and pg_cron all become per-schema work.

## Why

RLS in Supabase Postgres gives strong row-level isolation for free when every table has an `owner_id` column — which is already the shape every existing table follows (verified: contacts, relationships, interactions, open_threads, groups, candidate_sets, candidate_actions, all four User Context tables, all signal tables). Multi-tenant via RLS is the cheapest path that maintains the security boundary and ships to the App Store without per-tenant infra.

## Consequences

- **OAuth tokens are per-User.** Google Calendar (and any future OAuth-bound integration) stores `provider_token` + `provider_refresh_token` in a `user_provider_tokens` table keyed by `(owner_id, provider)`. The `sync-calendar` Edge Function iterates over Users with valid tokens and calls Google's API on their behalf with their token. RLS on `user_provider_tokens` is strict — only the owner can read their own tokens; the service-role-key path in the Edge Function is the only thing that can read across Users.
- **Native platform permissions are per-User on-device.** HealthKit on iOS is granted via Apple's standard permission flow during onboarding. The grant is User-bound to the iOS account; the app re-requests if a different User signs in on the same device.
- **Onboarding adds OAuth + permission steps.** Concretely: Connect Google Calendar (OAuth flow), Grant HealthKit access (iOS only), pick first few Contacts. The existing `onboarding_state` table tracks per-User onboarding completion.
- **Edge Functions are multi-tenant-aware.** Daily collectors (`sync-calendar`, `sync-sleep`) iterate over Users with valid integration state. The pg_cron job fires once per day per User local timezone (10 AM); the Function reads per-User OAuth tokens / Health credentials and writes to the per-User signal tables.
- **Platform support is iOS + Web for v1.** Android is deferred for v1 — confirmed with project sponsor 2026-05-19. ADR-0005's "iOS + Android + web" framing is narrowed accordingly. The web surface remains degraded for the Sleep signal (no HealthKit) but retains every other surface.
- **No cross-User features in v1.** Shared Relationships, collaborative Groups, social graph features are explicitly out of scope. Adding any later requires another ADR — the polymorphic `Relationship.target` (ADR-0004) does not extend to other Users.
- **PRD reframing is implicit.** The PRD ([#1](https://github.com/lucanardinocchi/Related/issues/1)) is the source of truth for the product brief and reads as single-User; this ADR overlays multi-tenant at the *system* level without changing the per-User product behaviour. The PRD itself stays as-is unless multi-User-facing features land later.
