# voice-tts

Text-to-speech Edge Function. Receives `{ text, voiceId? }` from the
client and streams the MP3 audio back from ElevenLabs. The
`ELEVENLABS_API_KEY` never leaves the server.

## Deploy

```sh
# One-time:
supabase secrets set ELEVENLABS_API_KEY=...
supabase secrets set ELEVENLABS_DEFAULT_VOICE_ID=21m00Tcm4TlvDq8ikWAM  # optional, defaults to Rachel
supabase secrets set ELEVENLABS_MODEL_ID=eleven_turbo_v2_5             # optional
# Each release:
supabase functions deploy voice-tts
```

## Contract

**Request** — `POST` with JSON `{ text: string, voiceId?: string }`.
- `text` (required) — the text to speak.
- `voiceId` (optional) — overrides the default voice. Use any voice id
  from your ElevenLabs library.

**Response** — `200 OK` with `Content-Type: audio/mpeg`, body is a
chunked MP3 stream. Pipe it straight into a playback surface (Web
Audio, an `<audio>` element on web, or `expo-av` on native).

**Errors** — JSON `{ error: string }` with appropriate non-2xx status.

## Why ElevenLabs

The slice's brief picked ElevenLabs for TTS quality. The streaming
endpoint (`/v1/text-to-speech/{voice_id}/stream`) gives us low
first-byte latency, which matters for the barge-in flow in
[ADR-0003](../../../../../docs/adr/0003-voice-pipeline-with-claude.md):
the User's mic re-arms as soon as the agent starts speaking, so the
earlier audio arrives, the more natural the turn-taking feels.

## Local dev

```sh
supabase functions serve voice-tts --env-file ./.env.local
```

with `ELEVENLABS_API_KEY=...` in `.env.local`.
