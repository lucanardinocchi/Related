# relay-sync

Mac relay pushes thread/message snapshots and heartbeats.

## Auth

Device headers (no JWT):

- `X-Relay-Device-Id`
- `X-Relay-Device-Secret`

## Request

`POST` with optional body fields:

```json
{
  "heartbeat": true,
  "threads": [
    {
      "external_chat_id": "chat-123",
      "external_chat_guid": "...",
      "is_group": false,
      "display_name": "Sam",
      "participant_handles": ["+15551234567"],
      "last_message_at": "2026-05-22T12:00:00.000Z"
    }
  ],
  "messages": [
    {
      "external_chat_id": "chat-123",
      "external_message_id": "msg-456",
      "direction": "inbound",
      "body": "Hey!",
      "sent_at": "2026-05-22T12:00:00.000Z",
      "service": "iMessage"
    }
  ]
}
```

Threads upsert on `(owner_id, external_chat_id)`. Messages upsert on `(owner_id, external_message_id)` with duplicate ignores. Unlinked threads are auto-matched to Contacts (1:1 phone) or Groups (≥2 member phone overlap).

## Response

```json
{ "ok": true, "linked": 1 }
```

## Deploy

```bash
supabase functions deploy relay-sync
```
