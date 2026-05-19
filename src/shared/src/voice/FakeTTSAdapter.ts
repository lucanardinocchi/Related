import type { TTSAdapter, TTSSynthesizeInput } from "./TTSAdapter";

/**
 * Deterministic TTS adapter for tests. Yields N audio chunks (default 3)
 * then completes. Honours `signal` — once aborted between chunks, the
 * iterator stops yielding further chunks. Tests use this to verify
 * barge-in cancels an in-flight TTS stream mid-playback.
 */
export interface FakeTTSAdapterOptions {
  /** How many chunks to yield. Default: 3. */
  chunkCount?: number;
  /** Bytes per chunk. Default: 4 (a single 16-bit stereo PCM frame-ish). */
  chunkSize?: number;
}

export class FakeTTSAdapter implements TTSAdapter {
  private readonly chunkCount: number;
  private readonly chunkSize: number;

  constructor(opts: FakeTTSAdapterOptions = {}) {
    this.chunkCount = opts.chunkCount ?? 3;
    this.chunkSize = opts.chunkSize ?? 4;
  }

  async *synthesizeStream(
    input: TTSSynthesizeInput,
  ): AsyncIterable<Uint8Array> {
    for (let i = 0; i < this.chunkCount; i++) {
      if (input.signal?.aborted) return;
      yield new Uint8Array(this.chunkSize).fill(i + 1);
    }
  }
}
