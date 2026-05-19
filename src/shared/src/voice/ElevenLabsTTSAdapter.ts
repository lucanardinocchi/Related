/**
 * Production TTS adapter targeting **ElevenLabs streaming TTS** via the
 * `voice-tts` Supabase Edge Function.
 *
 * The adapter never sees `ELEVENLABS_API_KEY`. It posts
 * `{ text, voiceId? }` to the Edge Function and pipes the streamed audio
 * response back as `Uint8Array` chunks. The Edge Function holds the key
 * and proxies to `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream`.
 *
 * Cancellation: when the input `signal` aborts, the iterator stops
 * yielding further chunks and releases the upstream reader. Combined
 * with the Edge Function aborting its own fetch on disconnect, that
 * gives us prompt barge-in behaviour from `VoiceSessionManager`.
 *
 * Note on `supabase.functions.invoke` response shape: `@supabase/supabase-js`
 * does not advertise streaming response support directly, but in practice
 * the data field surfaces a `ReadableStream<Uint8Array>` when the Edge
 * Function returns a non-JSON body with `Content-Type: audio/*`. We
 * handle both stream and one-shot Uint8Array/ArrayBuffer responses so the
 * adapter is resilient to that contract drifting.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TTSAdapter, TTSSynthesizeInput } from "./TTSAdapter";

export interface ElevenLabsTTSAdapterOptions {
  supabase: SupabaseClient;
  /** Override for staging variants. Defaults to 'voice-tts'. */
  functionName?: string;
  /**
   * Optional ElevenLabs voice id. If omitted, the Edge Function uses
   * `ELEVENLABS_DEFAULT_VOICE_ID` (default Rachel, `21m00Tcm4TlvDq8ikWAM`).
   */
  voiceId?: string;
}

export class ElevenLabsTTSAdapter implements TTSAdapter {
  private readonly supabase: SupabaseClient;
  private readonly functionName: string;
  private readonly voiceId?: string;

  constructor(opts: ElevenLabsTTSAdapterOptions) {
    this.supabase = opts.supabase;
    this.functionName = opts.functionName ?? "voice-tts";
    this.voiceId = opts.voiceId;
  }

  async *synthesizeStream(
    input: TTSSynthesizeInput,
  ): AsyncIterable<Uint8Array> {
    if (input.signal?.aborted) return;

    const body: { text: string; voiceId?: string } = { text: input.text };
    if (this.voiceId) body.voiceId = this.voiceId;

    const { data, error } = await this.supabase.functions.invoke(
      this.functionName,
      { body },
    );
    if (input.signal?.aborted) return;
    if (error) {
      throw new Error(
        (error as { message?: string }).message ??
          "voice-tts function call failed",
      );
    }
    if (!data) return;

    // One-shot bytes responses — yield as a single chunk.
    if (data instanceof Uint8Array) {
      if (input.signal?.aborted) return;
      yield data;
      return;
    }
    if (data instanceof ArrayBuffer) {
      if (input.signal?.aborted) return;
      yield new Uint8Array(data);
      return;
    }

    // Streamed response — iterate the reader, cancelling on abort.
    if (isReadableStream(data)) {
      const reader = data.getReader();
      const onAbort = () => {
        // Best-effort release; reader.cancel rejects if already released,
        // which is fine.
        reader.cancel().catch(() => {
          /* noop */
        });
      };
      if (input.signal) {
        input.signal.addEventListener("abort", onAbort, { once: true });
      }
      try {
        while (true) {
          if (input.signal?.aborted) return;
          const { done, value } = await reader.read();
          if (done) return;
          if (value) yield value;
        }
      } finally {
        if (input.signal) {
          input.signal.removeEventListener("abort", onAbort);
        }
        try {
          reader.releaseLock();
        } catch {
          /* noop */
        }
      }
      return;
    }

    // Last-ditch: try to coerce into bytes. Some clients deliver a Blob.
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      const buf = await data.arrayBuffer();
      if (input.signal?.aborted) return;
      yield new Uint8Array(buf);
      return;
    }

    throw new Error(
      "voice-tts returned an unsupported response type: " +
        Object.prototype.toString.call(data),
    );
  }
}

function isReadableStream(x: unknown): x is ReadableStream<Uint8Array> {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { getReader?: unknown }).getReader === "function"
  );
}
