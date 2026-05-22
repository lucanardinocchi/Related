# pocket-webhook

Receives Pocket `transcription.completed` webhooks and queues the recording
for import **15 minutes later** (`pocket_pending_imports`).

## Deploy

```bash
supabase functions deploy pocket-webhook
```

Users add a personal webhook in Pocket → Integrations pointing at:

`https://<project-ref>.supabase.co/functions/v1/pocket-webhook`

Event: `transcription.completed`. Paste the signing secret into Related Settings.
