# voice-stt

Speech-to-text Edge Function. Receives raw audio bytes from the client,
normalises them to 16 kHz mono WAV, proxies to [Wispr Flow's REST
API](https://api-docs.wisprflow.ai/rest_api_transcribe), and returns
`{ text }`. The `WISPRFLOW_API_KEY` never leaves the server.

## v1 vs v2

v1 is **blob-in / JSON-out**: the client accumulates the user's full
utterance, posts the bytes in one shot, and gets a single final
transcript. No partials.

Streaming partials are a v2 follow-up via Wispr Flow's WebSocket API
and a WebSocket adapter. v1 is good enough for the turn-based voice
mode the AgentScreen exposes today.

## Deploy

```sh
# One-time:
supabase secrets set WISPRFLOW_API_KEY=...
# Each release:
supabase functions deploy voice-stt
```

Create API keys at [platform.wisprflow.ai](https://platform.wisprflow.ai).

## Contract

**Request**
- Method: `POST`
- Body: raw audio bytes (webm, m4a, mp3, wav, …)
- Header: `x-audio-mime-type` (defaults to `audio/webm` if absent)

**Response** — `{ text: string }`.

**Errors** — `{ error: string }` with a `502` (upstream) or `400/500`
(client / config).

## Local dev

```sh
supabase functions serve voice-stt --env-file ./.env.local
```

with `WISPRFLOW_API_KEY=...` in `.env.local`.
