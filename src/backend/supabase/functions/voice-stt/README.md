# voice-stt

Speech-to-text Edge Function. Receives raw audio bytes from the client,
proxies to OpenAI Whisper, returns `{ text }`. The `OPENAI_API_KEY`
never leaves the server.

## Provider note — Whispr (Wispr) Flow vs OpenAI Whisper

Slice E's brief preferred Wispr Flow. After fetching `wisprflow.ai`
(where `whisprflow.ai` redirects) we confirmed Wispr Flow has **no
public REST or WebSocket API** — Flow ships as a dictation app, not a
developer platform. We fell back to OpenAI Whisper, which is the
pre-authorised escape hatch from the brief. If Wispr Flow opens a
developer API later, we can swap the upstream in this file without
changing the adapter contract.

## v1 vs v2

v1 is **blob-in / JSON-out**: the client accumulates the user's full
utterance, posts the bytes in one shot, and gets a single final
transcript. No partials.

Streaming partials are a v2 follow-up. OpenAI Whisper's HTTP endpoint
doesn't do partial streaming; a true streaming implementation needs a
different provider (Deepgram, AssemblyAI, Wispr if they open an API)
and a WebSocket adapter. v1 is good enough for the turn-based voice
mode the AgentScreen exposes today.

## Deploy

```sh
# One-time:
supabase secrets set OPENAI_API_KEY=sk-...
# Each release:
supabase functions deploy voice-stt
```

## Contract

**Request**
- Method: `POST`
- Body: raw audio bytes
- Header: `x-audio-mime-type` (defaults to `audio/webm` if absent)

**Response** — `{ text: string }`.

**Errors** — `{ error: string }` with a `502` (upstream) or `400/500`
(client / config).

## Local dev

```sh
supabase functions serve voice-stt --env-file ./.env.local
```

with `OPENAI_API_KEY=...` in `.env.local`.
