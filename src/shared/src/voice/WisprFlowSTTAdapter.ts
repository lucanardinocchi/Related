/**
 * Production STT adapter targeting **Wispr Flow** via the
 * `voice-stt` Supabase Edge Function.
 *
 * ## v1 vs streaming
 *
 * v1 is **blob-based**: the adapter accumulates every audio chunk yielded
 * by the input iterable, POSTs the joined blob to the Edge Function in
 * one shot, and emits a single `{ final }` event followed by
 * `{ endOfSpeech: true }`. No partials. The Edge Function converts the
 * blob to 16 kHz mono WAV before calling Wispr Flow's REST API.
 *
 * ## Key safety
 *
 * The Wispr Flow API key lives only in the Edge Function environment —
 * never in the client bundle. The client adapter just proxies the
 * audio blob through `supabase.functions.invoke('voice-stt', ...)`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  STTAdapter,
  STTEvent,
  STTTranscribeInput,
} from "./STTAdapter";

export interface WisprFlowSTTAdapterOptions {
  supabase: SupabaseClient;
  /** Override for staging or per-tenant variants. Defaults to 'voice-stt'. */
  functionName?: string;
  /**
   * Mime type hint the recorder used. Defaults to `audio/webm` which is
   * what `MediaRecorder` produces on Chrome / web.
   */
  mimeType?: string;
}

export class WisprFlowSTTAdapter implements STTAdapter {
  private readonly supabase: SupabaseClient;
  private readonly functionName: string;
  private readonly mimeType: string;

  constructor(opts: WisprFlowSTTAdapterOptions) {
    this.supabase = opts.supabase;
    this.functionName = opts.functionName ?? "voice-stt";
    this.mimeType = opts.mimeType ?? "audio/webm";
  }

  async *transcribeStream(
    input: STTTranscribeInput,
  ): AsyncIterable<STTEvent> {
    if (input.signal?.aborted) return;
    const collected: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of input.audio) {
      if (input.signal?.aborted) return;
      collected.push(chunk);
      total += chunk.byteLength;
    }
    if (input.signal?.aborted) return;

    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of collected) {
      merged.set(c, offset);
      offset += c.byteLength;
    }

    const { data, error } = await this.supabase.functions.invoke(
      this.functionName,
      {
        body: merged,
        headers: { "x-audio-mime-type": this.mimeType },
      },
    );
    if (input.signal?.aborted) return;
    if (error) {
      throw new Error(
        (error as { message?: string }).message ??
          "voice-stt function call failed",
      );
    }
    const text = (data as { text?: unknown })?.text;
    const finalText = typeof text === "string" ? text : "";
    yield { final: finalText };
    if (input.signal?.aborted) return;
    yield { endOfSpeech: true };
  }
}
