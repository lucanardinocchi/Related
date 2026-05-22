# generate-values-character

On-demand Values swipe clip: **suggest one character from alignments** (name + source + values), then **Seedance 2.0** video → `values-media` storage.

## Actions

| `action` | Purpose |
|---|---|
| `start` | Suggest character (if omitted) and start Replicate prediction |
| `poll` | Check prediction; upload MP4 when ready |

## Deploy

```sh
supabase secrets set REPLICATE_API_TOKEN=r8_...
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy generate-values-character
```

`SUPABASE_SERVICE_ROLE_KEY` is auto-injected for storage uploads.

## Errors

| HTTP | `code` | Meaning |
|---|---|---|
| 402 | `insufficient_credits` | Replicate billing — shown on `/values` |
| 502 | `generation_failed` | Replicate or upload failure |
