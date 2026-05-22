# ambient-dispatch

Drains baseline and triggered Agent Passes from `scheduled_passes` using the
service role. Replaces the web client's 30-second poll (`AmbientIntelligenceRunner`).

Each invocation runs at most one pass by default. Cron uses `{ "drain": true, "limit": 10 }`.

## Manual invoke

```json
{}
```

Drain up to 10 subscribed passes (ops):

```json
{ "drain": true, "limit": 10 }
```

## Deploy

```bash
supabase secrets set ambient_dispatch_url=https://<ref>.supabase.co/functions/v1/ambient-dispatch
supabase functions deploy ambient-dispatch
```

Apply migration `20260531000004_ambient_dispatch_cron.sql` for the pg_cron job and
`complete_scheduled_pass_service` RPC.

The function calls `engaged-pass` for the Sonnet proposal step (same as the former
client-side PassEngine path). Do not rename `engaged-pass` until all environments
ship the staged rename.

## Local

After `supabase start`, POST to `http://127.0.0.1:54321/functions/v1/ambient-dispatch`
with the service role key in `Authorization: Bearer <service_role_key>`.
