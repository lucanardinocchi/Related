# pocket-connect

Validate a Pocket AI API key (`pk_*`), resolve the User's account display
name (speaker label), and persist credentials to `user_provider_tokens` +
`pocket_integration`.

## Deploy

```bash
supabase functions deploy pocket-connect
```

## POST body

Connect:

```json
{ "apiKey": "pk_...", "accountDisplayName": "optional override" }
```

Disconnect:

```json
{ "action": "disconnect" }
```
