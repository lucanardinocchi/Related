/**
 * Streaming Speech-to-Text adapter port.
 *
 * Per ADR-0003 the voice pipeline is streaming STT → Claude Sonnet 4.6 →
 * streaming TTS. This interface is the contract a real Deepgram / Whisper
 * (or other) streaming adapter must satisfy. A real implementation will
 * land in a follow-up slice once the provider is picked — see issue #14.
 *
 * The adapter is intentionally provider-agnostic:
 *
 * - `audio` is an AsyncIterable of raw audio chunks; the manager pushes
 *   chunks from the platform-specific capture surface (mobile mic, web
 *   MediaStream). The adapter is responsible for any reframing the
 *   underlying provider requires.
 * - The returned AsyncIterable yields a stream of `STTEvent`s. Partial
 *   transcripts arrive as `{ partial: "..." }`. The final transcript for a
 *   turn arrives as `{ final: "..." }`. End-of-speech is signalled with
 *   `{ endOfSpeech: true }` and ends the turn.
 * - The adapter must support cooperative cancellation via the optional
 *   `signal`. When the manager triggers barge-in (User starts speaking
 *   mid-agent-response) it aborts the signal; the adapter should stop
 *   producing events and close its upstream connection promptly.
 */
export interface STTEvent {
  /** Partial in-flight transcript. May be revised by later events. */
  partial?: string;
  /** Final transcript for this turn — stable, won't be revised. */
  final?: string;
  /** Voice activity detector reports the speaker has stopped talking. */
  endOfSpeech?: boolean;
}

export interface STTTranscribeInput {
  audio: AsyncIterable<Uint8Array>;
  /** Optional abort signal — used by VoiceSessionManager for barge-in. */
  signal?: AbortSignal;
}

export interface STTAdapter {
  transcribeStream(input: STTTranscribeInput): AsyncIterable<STTEvent>;
}
