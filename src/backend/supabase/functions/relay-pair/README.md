# relay-pair

Pair a Mac Messages relay daemon with a User account.

## create_code (JWT)

`POST` with `Authorization: Bearer <user_jwt>`.

```json
{ "action": "create_code" }
```

Returns an 8-character code valid for 10 minutes:

```json
{ "code": "AB3K9XYZ", "expiresAt": "2026-05-22T12:10:00.000Z" }
```

## exchange (no JWT)

Mac relay exchanges the code for device credentials:

```json
{
  "action": "exchange",
  "code": "AB3K9XYZ",
  "deviceName": "Luca's MacBook",
  "deviceSecret": "<random-secret>"
}
```

Returns:

```json
{ "deviceId": "...", "ownerId": "..." }
```

Store `deviceId` and `deviceSecret` locally; use them as relay device auth headers on sync/outbound calls.

## Deploy

```bash
supabase functions deploy relay-pair --no-verify-jwt
```

JWT is checked inside the handler for `create_code`; `exchange` is unauthenticated at the gateway and validated via the one-time code.
