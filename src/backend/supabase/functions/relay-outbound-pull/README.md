# relay-outbound-pull

Mac relay drains pending outbound messages queued by the web app.

## Auth

Device headers (no JWT):

- `X-Relay-Device-Id`
- `X-Relay-Device-Secret`

## Request

`POST` with empty body or `{}`.

## Response

```json
{
  "ok": true,
  "items": [
    {
      "id": "...",
      "threadId": "...",
      "contactId": "...",
      "groupId": null,
      "body": "See you tomorrow!",
      "createdAt": "2026-05-22T12:00:00.000Z",
      "externalChatId": "chat-123"
    }
  ]
}
```

## Deploy

```bash
supabase functions deploy relay-outbound-pull
```
