# sync-sleep

Edge Function that ingests the User's last-3-days Sleep records into
`inferred_signal_sleep`. Invoked once per User per day by pg_cron at
10 AM (UTC v1 — per-User-local time deferred per ADR).

## Status: scaffolding

Today the function uses a **fake fetcher** that returns `[]`. The
real HealthKit native fetcher needs an Expo config plugin and a thin
Swift bridge — both have to be added on a Mac with Xcode, so they're
tracked on the Slice 12 follow-up issue.

When that native module ships, the **only change** to this function
is to swap `fakeFetcher` for a call into the bridged native module
(or, more likely, for a per-User mobile-pushed batch — see PRD).
The persistence path (collector contract + (owner_id, record_id)
uniqueness) is unchanged.

## Deploy

```sh
supabase functions deploy sync-sleep
```

## Contract

**Request body** — `{ ownerId: string; asOf?: ISO8601 string }`.

**Response** — `{ recordsWritten: number }`.

## Why duplicated logic

The function inlines the upsert + GC against `inferred_signal_sleep`
rather than importing `SleepCollector` from `@related/shared`.
Deno's NPM specifiers handle external packages, but reaching across
the `backend/` boundary into the workspace is awkward at deploy.
Small duplication for a self-contained deploy unit; if the contract
changes (e.g. extra column), mirror the change here.
