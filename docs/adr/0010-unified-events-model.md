# Unified editable Event model for the Calendar surface

**Partially supersedes [ADR-0008](0008-web-primary-mobile-ambient.md).** ADR-0008 described the web Calendar as a unified *read* view over Interactions plus Google events from `inferred_signal_calendar`, with no user enrichment on external rows. This ADR replaces that read-only split on the `/calendar` surface with a single editable `events` table that holds both manual entries and Google-synced rows, with user-authored fields preserved across re-syncs.

## Considered options

- **Keep ADR-0008's read-only Calendar** — Interactions remain the editable operational log; Google events stay in `inferred_signal_calendar` as a separate, read-only overlay. Rejected: the User needs to capture `aim` and `required prep` on upcoming events (including Google-sourced ones) before they happen. A read-only overlay cannot hold that enrichment, and treating Interactions as the editable stand-in for calendar events conflates two domain concepts (a logged touchpoint vs. a scheduled block on a calendar).
- **Enrich `inferred_signal_calendar` in place** — add `aim`, `required_prep`, `status`, `type` columns to the agent's density signal table and let the UI write there. Rejected: that table is the input to the agent's Calendar density signal; mixing user-facing CRUD with agent inference storage couples unrelated lifecycles and makes Google sync overwrite logic fragile.
- **Editable Events table + keep Interactions separate** — new `events` table is the sole source for `/calendar` and `/calendar/[id]`; Interactions remain the operational touchpoint log linked to Relationships. Chosen.

## Why

The Calendar redesign targets pre-event reflection: what is this for (`aim`), what do I need to do beforehand (`required prep`), and did I actually go (`status`, including `attended` vs `occurred`). Those fields apply equally to Google-synced meetings and manually created blocks. Materialising Google rows into `events` with a stable `external_event_id` upsert key lets `sync-calendar` refresh title/time/location without clobbering user enrichment.

`inferred_signal_calendar` and `inferred_signal_calendar_overlay` remain on the backend as deprecated artifacts feeding agent signals until a follow-up migration drops them after we confirm nothing else reads them.

## Consequences

- **New migration** `20260521000005_events.sql`: `events` table, `event_type` / `event_status` / `event_source` enums, RLS policies, `updated_at` trigger. Status enum includes `attended` (semantically narrower than `occurred`, ported from PR #55's Interaction taxonomy).
- **`EventsClient`** in `@related/shared` — CRUD + list helpers; **`CalendarEventsClient`** retained only for agent signal reads if still needed elsewhere.
- **`sync-calendar` Edge Function** upserts into `events` (Google-owned columns only on conflict).
- **Web routes**: `/calendar` list, `/calendar/new`, `/calendar/[id]` detail with inline editing.
- **`calendarAnalytics`** refactored to consume `events` instead of Interactions + external overlays.
- **Mobile** is unchanged in this PR — Calendar CRUD is web-primary per ADR-0008; mobile continues ambient capture.
- **ADR-0008 wording** on "unified Calendar (Interactions + external Google events)" applies only to the pre-0010 implementation; new work should cite ADR-0010 for Calendar behaviour.
