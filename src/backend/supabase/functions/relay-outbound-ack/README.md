# relay-outbound-ack

Mac relay reports send success or failure for a queued outbound message.

## Auth

Device headers (no JWT):

- `X-Relay-Device-Id`
- `X-Relay-Device-Secret`

## Request

`POST`:

```json
{
  "id": "<outbound_queue id>",
  "status": "sent",
  "externalMessageId": "msg-789",
  "sentAt": "2026-05-22T12:01:00.000Z"
}
```

On failure:

```json
{
  "id": "<outbound_queue id>",
  "status": "failed",
  "error": "recipient unreachable"
}
```

When `status` is `sent`, an outbound row is inserted into `messages`.

## Response

```json
{ "ok": true }
```

## Deploy

```bash
supabase functions deploy relay-outbound-ack
```
