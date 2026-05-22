# pocket-sync

Import Pocket recordings created **after connect date** into hidden
`source='pocket'` Chats, run Extraction Pass, and surface speaker-label
ambiguities for manual resolution.

Already-imported recording IDs are skipped permanently.

## Deploy

```bash
supabase functions deploy pocket-sync
```

## POST body

Sync all new recordings:

```json
{}
```

Resolve a speaker ambiguity and import one recording:

```json
{
  "action": "resolveSpeaker",
  "recordingId": "...",
  "speaker": "Luca"
}
```
