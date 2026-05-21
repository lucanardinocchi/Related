# Values media generation

Offline pipeline that creates muxed swipe clips per character:

1. **AI video** — [PixVerse V6](https://replicate.com/pixverse/pixverse-v6) on Replicate (9:16 portrait, character-focused). Override with `REPLICATE_VIDEO_MODEL=kwaivgi/kling-v3-video` if needed.
2. **Licensed music** — SoundHelix tracks (CC BY 4.0), mood-matched from character values
3. **FFmpeg mux** — H.264 + AAC, `-movflags +faststart`, trimmed to ~8s
4. **Supabase Storage** — public `values-media/{characterId}.mp4`
5. **Manifest** — writes `src/shared/src/values/valuesMediaManifest.json` (consumed by the web app)

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
node scripts/generate-values-media.mjs --limit 3
```

### Useful flags

| Flag | Purpose |
|---|---|
| `--id ted-lasso` | One character (repeatable) |
| `--limit 10` | Cap batch size |
| `--force` | Regenerate even if manifest entry exists |
| `--dry-run` | Print prompts/moods without API calls |
| `--skip-upload` | Keep muxed files in `.cache/values-media/` only |

### Environment

| Variable | Default | Notes |
|---|---|---|
| `REPLICATE_VIDEO_MODEL` | `pixverse/pixverse-v6` | Replicate model slug. PixVerse V6 is best for portrait character clips; Kling 3.0 is the fallback. |
| `VALUES_MEDIA_DURATION` | `8` | Output clip length (seconds) |
| `VALUES_MEDIA_MUSIC_VOLUME` | `0.35` | Background music gain |

Raw and muxed intermediates are cached under `src/backend/.cache/values-media/{characterId}/`.

## Deploy after generation

Commit the updated manifest (URLs only — clips live in Storage):

```sh
git add src/shared/src/values/valuesMediaManifest.json
git commit -m "Update values media manifest"
```

Then deploy web as usual. Characters without manifest entries keep the stock Mixkit fallback (split video + music).

## Cost note

~100 characters × one Replicate video each adds up. Use `--limit` while iterating on prompts, then batch overnight.
