# sync-calendar

Backfills calendar events on connect, then keeps them fresh via push webhooks.

## Sync window

- **History:** 365 days back
- **Future:** 730 days forward (~2 years)
- Paginated fetch (Google 250/page, Outlook 100/page)

## Triggers

| When | Call |
|------|------|
| Google Calendar connect | `triggerCalendarConnectSync` → `{ ownerId, subscribe: true }` |
| Outlook OAuth callback | same |
| Settings health probe | `{ ownerId }` (no subscribe) |
| Subscription renewal cron 09:00 UTC | `calendar-renew-subscriptions` |

## Push webhooks

| Provider | Endpoint | Mechanism |
|----------|----------|-----------|
| Google | `google-calendar-webhook` | `events.watch` + incremental `syncToken` |
| Outlook | `outlook-calendar-webhook` | Graph `subscriptions` on `me/events` |

State stored in `calendar_sync_subscriptions`.

## Deploy

```bash
supabase db push   # calendar_sync_subscriptions migration
supabase functions deploy sync-calendar
supabase functions deploy google-calendar-webhook --no-verify-jwt
supabase functions deploy outlook-calendar-webhook --no-verify-jwt
supabase functions deploy calendar-renew-subscriptions
```

Dual-write logic is mirrored in `_shared/calendarSyncEngine.ts` (Deno) and `src/shared/src/signals/calendarSyncDualWrite.ts` (Node/tests).
