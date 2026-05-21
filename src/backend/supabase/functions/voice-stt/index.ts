// voice-stt Edge Function — speech-to-text proxy.
//
// Why this exists: the Wispr Flow API key must never leave the server.
// Client adapters POST raw audio bytes here; this function normalises
// them to 16 kHz mono WAV and hands them to Wispr Flow's REST API.
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
// Deploy:
//   supabase secrets set WISPRFLOW_API_KEY=...
//   supabase functions deploy voice-stt
//
// Local run:
//   supabase functions serve voice-stt --env-file ./.env.local

import { audioToWav16k, bytesToBase64 } from "./_audioToWav16k.ts";

const WISPRFLOW_API_KEY = Deno.env.get("WISPRFLOW_API_KEY");
const WISPRFLOW_API_URL =
  "https://platform-api.wisprflow.ai/api/v1/dash/api";
const DEFAULT_MIME = "audio/webm";

if (!WISPRFLOW_API_KEY) {
  console.warn(
    "WISPRFLOW_API_KEY is not set in the function environment — voice-stt will fail",
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonError(405, "method not allowed");
  }
  if (!WISPRFLOW_API_KEY) {
    return jsonError(500, "WISPRFLOW_API_KEY not configured");
  }

  const mime = req.headers.get("x-audio-mime-type") ?? DEFAULT_MIME;
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) {
    return jsonError(400, "empty audio body");
  }

  let wavBytes: Uint8Array;
  try {
    wavBytes = await audioToWav16k(bytes, mime);
  } catch (err) {
    return jsonError(
      400,
      "audio conversion failed: " +
        (err instanceof Error ? err.message : String(err)),
    );
  }

  let wisprResponse: Response;
  try {
    wisprResponse = await fetch(WISPRFLOW_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WISPRFLOW_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio: bytesToBase64(wavBytes),
        language: ["en"],
        context: {
          app: { type: "ai" },
        },
      }),
    });
  } catch (err) {
    return jsonError(
      502,
      "wisprflow upstream fetch failed: " +
        (err instanceof Error ? err.message : String(err)),
    );
  }

  if (!wisprResponse.ok) {
    const body = await wisprResponse.text().catch(() => "");
    return jsonError(
      502,
      `wisprflow returned ${wisprResponse.status}: ${body.slice(0, 500)}`,
    );
  }

  let payload: { text?: unknown };
  try {
    payload = await wisprResponse.json();
  } catch {
    return jsonError(502, "wisprflow returned invalid JSON");
  }

  const text = typeof payload.text === "string" ? payload.text.trim() : "";
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
