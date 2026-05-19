import type {
  STTAdapter,
  STTEvent,
  STTTranscribeInput,
} from "./STTAdapter";

/**
 * Deterministic STT adapter for tests. Yields a scripted sequence of
 * partials → final → endOfSpeech regardless of the input audio. The
 * script can be supplied per-instance; the default mirrors a typical
 * "hello world" utterance and ends the turn after one final transcript.
 *
 * Honours `signal` — once aborted, the iterator stops yielding further
 * events and exits (the manager uses this to verify barge-in cancels
 * an in-flight transcription).
 */
export interface FakeSTTAdapterOptions {
  events?: STTEvent[];
}

const DEFAULT_EVENTS: STTEvent[] = [
  { partial: "hello" },
  { partial: "hello world" },
  { final: "hello world" },
  { endOfSpeech: true },
];

export class FakeSTTAdapter implements STTAdapter {
  private readonly events: STTEvent[];

  constructor(opts: FakeSTTAdapterOptions = {}) {
    this.events = opts.events ?? DEFAULT_EVENTS;
  }

  async *transcribeStream(
    input: STTTranscribeInput,
  ): AsyncIterable<STTEvent> {
    for (const event of this.events) {
      if (input.signal?.aborted) return;
      yield event;
    }
  }
}
