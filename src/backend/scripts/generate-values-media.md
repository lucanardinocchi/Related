# Values media generation

Offline pipeline that creates muxed swipe clips per character:

1. **AI video** — [Seedance 2.0](https://replicate.com/bytedance/seedance-2.0) on Replicate (9:16 portrait, character-focused). Use `REPLICATE_VIDEO_MODEL=bytedance/seedance-2.0-fast` for cheaper iteration.
2. **Licensed music** — SoundHelix tracks (CC BY 4.0), mood-matched from character values
3. **FFmpeg mux** — H.264 + AAC, `-movflags +faststart`, trimmed to ~8s
4. **Supabase Storage** — public `values-media/{characterId}.mp4`
5. **Manifest** — writes `src/shared/src/values/valuesMediaManifest.json` (consumed by the web app)

Only characters listed in the manifest appear on `/values` swipe cards.

## Prerequisites

- `ffmpeg` on PATH
- [Replicate](https://replicate.com) API token
- Supabase service role key (upload only)
- Migration `20260529000004_values_media_storage.sql` applied (`supabase db push`)

## Generate clips

```sh
cd src/backend

REPLICATE_API_TOKEN=r8_... \
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role> \
node scripts/generate-values-media.mjs --missing
```

Or from repo root:

```sh
npm run generate:values-missing
```

### Useful flags

| Flag | Purpose |
|---|---|
| `--id ted-lasso` | One character (repeatable) |
| `--limit 10` | Cap batch size |
| `--missing` | Only seed characters without manifest URLs |
| `--force` | Regenerate even if manifest entry exists |
| `--dry-run` | Print prompts/moods without API calls |
| `--skip-upload` | Keep muxed files in `.cache/values-media/` only |

### Environment

| Variable | Default | Notes |
|---|---|---|
| `REPLICATE_VIDEO_MODEL` | `bytedance/seedance-2.0` | Replicate model slug |
| `VALUES_MEDIA_DURATION` | `8` | Output clip length (seconds) |
| `VALUES_MEDIA_MUSIC_VOLUME` | `0.35` | Background music gain |

Raw and muxed intermediates are cached under `src/backend/.cache/values-media/{characterId}/`.

## Deploy after generation

Commit the updated manifest (URLs only — clips live in Storage):

```sh
git add src/shared/src/values/valuesMediaManifest.json
git commit -m "Update values media manifest"
```

Then deploy web as usual.

## Cost note

~100 characters × one Replicate video each adds up. Use `--limit` while iterating on prompts, then `npm run generate:values-missing` overnight for the rest.
