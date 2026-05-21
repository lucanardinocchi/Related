import type { SupabaseClient } from "@supabase/supabase-js";
import { WisprFlowSTTAdapter } from "./WisprFlowSTTAdapter";

async function* audioOf(chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  for (const c of chunks) yield c;
}

describe("WisprFlowSTTAdapter.transcribeStream", () => {
  it("accumulates audio chunks, POSTs them to the voice-stt Edge Function, and yields a final + endOfSpeech event with the transcript", async () => {
    const invoke = jest
      .fn()
      .mockResolvedValue({ data: { text: "what's up with Sam" }, error: null });
    const supa = { functions: { invoke } } as unknown as SupabaseClient;
    const adapter = new WisprFlowSTTAdapter({ supabase: supa });

    const chunks = [
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5, 6]),
    ];
    const events: Array<{ final?: string; endOfSpeech?: boolean }> = [];
    for await (const ev of adapter.transcribeStream({ audio: audioOf(chunks) })) {
      events.push(ev);
    }

    expect(invoke).toHaveBeenCalledTimes(1);
    const [name, opts] = invoke.mock.calls[0];
    expect(name).toBe("voice-stt");
    const body = (opts as { body: unknown }).body;
    const bytes = bodyToBytes(body);
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5, 6]);

    expect(events).toEqual([
      { final: "what's up with Sam" },
      { endOfSpeech: true },
    ]);
  });

  it("returns empty final transcript if the function returns null/empty text", async () => {
    const invoke = jest.fn().mockResolvedValue({ data: { text: "" }, error: null });
    const supa = { functions: { invoke } } as unknown as SupabaseClient;
    const adapter = new WisprFlowSTTAdapter({ supabase: supa });

    const events: Array<{ final?: string; endOfSpeech?: boolean }> = [];
    for await (const ev of adapter.transcribeStream({
      audio: audioOf([new Uint8Array([1])]),
    })) {
      events.push(ev);
    }
    expect(events).toEqual([{ final: "" }, { endOfSpeech: true }]);
  });

  it("throws if the Edge Function returns an error", async () => {
    const invoke = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: "wisprflow offline" } });
    const supa = { functions: { invoke } } as unknown as SupabaseClient;
    const adapter = new WisprFlowSTTAdapter({ supabase: supa });

    async function consume() {
      for await (const _ev of adapter.transcribeStream({
        audio: audioOf([new Uint8Array([1])]),
      })) {
        /* drain */
      }
    }
    await expect(consume()).rejects.toThrow(/wisprflow offline/);
  });

  it("aborts before invoking when the signal is already aborted", async () => {
    const invoke = jest.fn();
    const supa = { functions: { invoke } } as unknown as SupabaseClient;
    const adapter = new WisprFlowSTTAdapter({ supabase: supa });
    const ctrl = new AbortController();
    ctrl.abort();

    const events: unknown[] = [];
    for await (const ev of adapter.transcribeStream({
      audio: audioOf([new Uint8Array([1])]),
      signal: ctrl.signal,
    })) {
      events.push(ev);
    }
    expect(events).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("respects mimeType option for the audio format hint header", async () => {
    const invoke = jest
      .fn()
      .mockResolvedValue({ data: { text: "hi" }, error: null });
    const supa = { functions: { invoke } } as unknown as SupabaseClient;
    const adapter = new WisprFlowSTTAdapter({
      supabase: supa,
      mimeType: "audio/mp4",
    });
    for await (const _ev of adapter.transcribeStream({
      audio: audioOf([new Uint8Array([1])]),
    })) {
      /* drain */
    }
    const opts = invoke.mock.calls[0][1] as {
      headers?: Record<string, string>;
    };
    expect(opts.headers?.["x-audio-mime-type"]).toBe("audio/mp4");
  });
});

function bodyToBytes(body: unknown): Uint8Array {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    throw new Error("Blob bodies are async; not used in this adapter for v1");
  }
  throw new Error("unrecognised body type: " + Object.prototype.toString.call(body));
}
