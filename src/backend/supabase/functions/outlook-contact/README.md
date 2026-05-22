# outlook-contact

Edge Function that lists and sends Outlook mail for a Contact email address using the User's linked Microsoft account.

## Request

`POST` with `Authorization: Bearer <user_jwt>`.

### List messages

```json
{
  "action": "list",
  "contactEmail": "sam@example.com",
  "maxResults": 20
}
```

### Get message body

```json
{
  "action": "get",
  "messageId": "AAMkAG..."
}
```

### Send message

```json
{
  "action": "send",
  "to": "sam@example.com",
  "subject": "Catch up?",
  "body": "Hey Sam — free for coffee next week?"
}
```

## Response status values

| status | Meaning |
|--------|---------|
| `ok` | Success |
| `no_token` | User has not connected Outlook |
| `needs_outlook_mail_scopes` | Outlook connected but Mail scopes missing — reconnect in Settings |
| `needs_reconsent` | Refresh token revoked — re-connect Outlook |
| `error` | Microsoft Graph failure |

## Deploy

```bash
supabase secrets set MICROSOFT_CLIENT_ID=...
supabase secrets set MICROSOFT_CLIENT_SECRET=...
supabase functions deploy outlook-contact
```

Requires the same Microsoft OAuth client credentials as `outlook-oauth` and `sync-calendar`.
