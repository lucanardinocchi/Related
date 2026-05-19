// voice-stt Edge Function — speech-to-text proxy.
//
// Why this exists: the OpenAI API key must never leave the server.
// Client adapters POST raw audio bytes here; this function attaches the
// `OPENAI_API_KEY` and hands the blob to Whisper.
//
// ## v1 contract
//
// **Request**
// - method: POST
// - body: raw audio bytes (Uint8Array / ArrayBuffer / Blob)
// - header: `x-audio-mime-type` — e.g. `audio/webm`, `audio/mp4`, `audio/mpeg`
//
// **Response** — `{ text: string }`. JSON.
//
// v1 ships **blob-in / JSON-out** because it is the smaller surface and
// `OpenAIWhisperSTTAdapter` only needs the final transcript. Streaming
// partials are a v2 follow-up (probably a WebSocket adapter against
// Deepgram or AssemblyAI; OpenAI's REST endpoint is not partial-streaming).
//
// Deploy:
//   supabase secrets set OPENAI_API_KEY=sk-...
//   supabase functions deploy voice-stt
//
// Local run:
//   supabase functions serve voice-stt --env-file ./.env.local
//
// deno-lint-ignore-file no-explicit-any

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
if (!OPENAI_API_KEY) {
  console.warn(
    "OPENAI_API_KEY is not set in the function environment — voice-stt will fail",
  );
}

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_MIME = "audio/webm";

// Whisper rejects filenames without a known extension. Mime → extension
// map covers everything `MediaRecorder` and Expo's native recorder
// commonly produce.
const MIME_TO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
};

function extForMime(mime: string): string {
  const root = mime.split(";")[0].trim().toLowerCase();
  return MIME_TO_EXT[root] ?? "webm";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonError(405, "method not allowed");
  }
  if (!OPENAI_API_KEY) {
    return jsonError(500, "OPENAI_API_KEY not configured");
  }

  const mime = req.headers.get("x-audio-mime-type") ?? DEFAULT_MIME;
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) {
    return jsonError(400, "empty audio body");
  }

  const form = new FormData();
  const ext = extForMime(mime);
  form.append("file", new Blob([bytes], { type: mime }), `audio.${ext}`);
  form.append("model", "whisper-1");
  // Force `text` response to avoid Whisper's verbose-json envelope; we
  // only need the transcript.
  form.append("response_format", "text");

  let whisperResponse: Response;
  try {
    whisperResponse = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    });
  } catch (err) {
    return jsonError(
      502,
      "whisper upstream fetch failed: " +
        (err instanceof Error ? err.message : String(err)),
    );
  }

  if (!whisperResponse.ok) {
    const body = await whisperResponse.text().catch(() => "");
    return jsonError(
      502,
      `whisper returned ${whisperResponse.status}: ${body.slice(0, 500)}`,
    );
  }

  const text = (await whisperResponse.text()).trim();
  return new Response(JSON.stringify({ text }), {
    headers: { "content-type": "application/json" },
  });
});

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
