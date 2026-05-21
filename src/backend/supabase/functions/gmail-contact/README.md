# gmail-contact

Edge Function that lists and sends Gmail messages for a Contact email address using the User's linked Google account.

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
| `no_token` | User has not connected Google |
| `needs_gmail_scopes` | Google connected but Gmail scopes missing — connect Gmail in Settings |
| `needs_reconsent` | Refresh token revoked — re-connect Google |
| `error` | Gmail API failure |

## Deploy

```bash
supabase secrets set GOOGLE_OAUTH_CLIENT_ID=...
supabase secrets set GOOGLE_OAUTH_CLIENT_SECRET=...
supabase functions deploy gmail-contact
```

Requires the same Google OAuth client credentials as `sync-calendar`.
