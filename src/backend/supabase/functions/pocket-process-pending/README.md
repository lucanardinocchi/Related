# pocket-process-pending

Processes queued Pocket imports after the 15-minute delay and runs
Extraction Pass. Invoked by pg_cron (`dispatch_pocket_pending_imports`) or
manually:

```json
{ "ownerId": "...", "recordingId": "..." }
```

Drain all due rows (ops):

```json
{ "drain": true }
```

## Deploy

```bash
supabase secrets set pocket_process_pending_url=https://<ref>.supabase.co/functions/v1/pocket-process-pending
supabase functions deploy pocket-process-pending
```

Apply migration `20260530000002_pocket_auto_import.sql` for the cron job.
