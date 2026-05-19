/**
 * Streaming Text-to-Speech adapter port.
 *
 * Per ADR-0003 the voice pipeline is streaming STT → Claude Sonnet 4.6 →
 * streaming TTS. This interface is the contract a real ElevenLabs /
 * Cartesia (or other) streaming adapter must satisfy. A real implementation
 * will land in a follow-up slice once the provider is picked — see
 * issue #14.
 *
 * The adapter is intentionally provider-agnostic:
 *
 * - `text` is the agent's spoken response. v1 ships one curated voice for
 *   every User so the voice identity is configured at adapter
 *   construction; it is not a per-call parameter on this interface.
 * - The returned AsyncIterable yields raw audio chunks the manager pipes
 *   into the platform-specific playback surface.
 * - The adapter must support cooperative cancellation via the optional
 *   `signal`. When the manager triggers barge-in it aborts the signal;
 *   the adapter should stop emitting chunks and close its upstream
 *   connection promptly so playback can be cut without a queued tail.
 */
export interface TTSSynthesizeInput {
  text: string;
  /** Optional abort signal — used by VoiceSessionManager for barge-in. */
  signal?: AbortSignal;
}

export interface TTSAdapter {
  synthesizeStream(input: TTSSynthesizeInput): AsyncIterable<Uint8Array>;
}
