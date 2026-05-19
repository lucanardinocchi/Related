// voice-tts Edge Function — text-to-speech proxy.
//
// Why this exists: ElevenLabs API keys must never reach the client
// bundle. The client adapter POSTs `{ text, voiceId? }`; this function
// adds the `xi-api-key` header and streams the audio response back.
//
// ## Contract
//
// **Request** — JSON `{ text: string, voiceId?: string }`. If `voiceId`
// is omitted we use `ELEVENLABS_DEFAULT_VOICE_ID` (default
// `21m00Tcm4TlvDq8ikWAM` — Rachel, ElevenLabs' default English voice).
//
// **Response** — `audio/mpeg` MP3 stream, chunked. The body is piped
// from ElevenLabs' `/v1/text-to-speech/{voice_id}/stream` endpoint.
//
// Deploy:
//   supabase secrets set ELEVENLABS_API_KEY=...
//   supabase secrets set ELEVENLABS_DEFAULT_VOICE_ID=21m00Tcm4TlvDq8ikWAM  # optional
//   supabase functions deploy voice-tts

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const DEFAULT_VOICE_ID =
  Deno.env.get("ELEVENLABS_DEFAULT_VOICE_ID") ?? "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL_ID =
  Deno.env.get("ELEVENLABS_MODEL_ID") ?? "eleven_turbo_v2_5";

if (!ELEVENLABS_API_KEY) {
  console.warn(
    "ELEVENLABS_API_KEY is not set — voice-tts will return 500 on every call",
  );
}

interface TtsRequest {
  text?: unknown;
  voiceId?: unknown;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonError(405, "method not allowed");
  }
  if (!ELEVENLABS_API_KEY) {
    return jsonError(500, "ELEVENLABS_API_KEY not configured");
  }

  let body: TtsRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid JSON body");
  }

  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    return jsonError(400, "missing `text`");
  }
  const voiceId =
    typeof body.voiceId === "string" && body.voiceId.trim().length > 0
      ? body.voiceId
      : DEFAULT_VOICE_ID;

  const upstreamUrl = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: DEFAULT_MODEL_ID,
        // Standard defaults; tweak per-voice in a future iteration.
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
  } catch (err) {
    return jsonError(
      502,
      "elevenlabs upstream fetch failed: " +
        (err instanceof Error ? err.message : String(err)),
    );
  }

  if (!upstream.ok || !upstream.body) {
    const errBody = await upstream.text().catch(() => "");
    return jsonError(
      502,
      `elevenlabs returned ${upstream.status}: ${errBody.slice(0, 500)}`,
    );
  }

  // Pipe upstream body straight through — `Content-Type: audio/mpeg` so
  // the client treats it as raw audio bytes. The `Cache-Control: no-store`
  // is defensive: a TTS response is response-specific and should never
  // be cached by any intermediary.
  return new Response(upstream.body, {
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "no-store",
    },
  });
});

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
