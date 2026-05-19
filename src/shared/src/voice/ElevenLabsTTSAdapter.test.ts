import type { SupabaseClient } from "@supabase/supabase-js";
import { ElevenLabsTTSAdapter } from "./ElevenLabsTTSAdapter";

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[i++]);
    },
  });
}

describe("ElevenLabsTTSAdapter.synthesizeStream", () => {
  it("POSTs text + voiceId to voice-tts and yields the streamed audio chunks", async () => {
    const audioChunks = [
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
      new Uint8Array([5]),
    ];
    const invoke = jest.fn().mockResolvedValue({
      data: streamFromChunks(audioChunks),
      error: null,
    });
    const supa = { functions: { invoke } } as unknown as SupabaseClient;

    const adapter = new ElevenLabsTTSAdapter({
      supabase: supa,
      voiceId: "21m00Tcm4TlvDq8ikWAM",
    });

    const collected: Uint8Array[] = [];
    for await (const chunk of adapter.synthesizeStream({ text: "hello" })) {
      collected.push(chunk);
    }

    expect(invoke).toHaveBeenCalledTimes(1);
    const [name, opts] = invoke.mock.calls[0];
    expect(name).toBe("voice-tts");
    expect(opts).toEqual(
      expect.objectContaining({
        body: { text: "hello", voiceId: "21m00Tcm4TlvDq8ikWAM" },
      }),
    );
    expect(collected.map((c) => Array.from(c))).toEqual([
      [1, 2],
      [3, 4],
      [5],
    ]);
  });

  it("works without voiceId (Edge Function falls back to ELEVENLABS_DEFAULT_VOICE_ID)", async () => {
    const invoke = jest.fn().mockResolvedValue({
      data: streamFromChunks([new Uint8Array([7])]),
      error: null,
    });
    const supa = { functions: { invoke } } as unknown as SupabaseClient;
    const adapter = new ElevenLabsTTSAdapter({ supabase: supa });

    const collected: Uint8Array[] = [];
    for await (const c of adapter.synthesizeStream({ text: "hi" })) {
      collected.push(c);
    }
    const opts = invoke.mock.calls[0][1] as { body: { voiceId?: string } };
    expect(opts.body.voiceId).toBeUndefined();
    expect(collected[0][0]).toBe(7);
  });

  it("throws if the Edge Function returns an error", async () => {
    const invoke = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: "tts failed" } });
    const supa = { functions: { invoke } } as unknown as SupabaseClient;
    const adapter = new ElevenLabsTTSAdapter({ supabase: supa });
    async function consume() {
      for await (const _c of adapter.synthesizeStream({ text: "x" })) {
        /* drain */
      }
    }
    await expect(consume()).rejects.toThrow(/tts failed/);
  });

  it("supports an ArrayBuffer / Uint8Array response (non-stream) by yielding it as a single chunk", async () => {
    const invoke = jest
      .fn()
      .mockResolvedValue({ data: new Uint8Array([9, 9, 9]), error: null });
    const supa = { functions: { invoke } } as unknown as SupabaseClient;
    const adapter = new ElevenLabsTTSAdapter({ supabase: supa });
    const collected: Uint8Array[] = [];
    for await (const c of adapter.synthesizeStream({ text: "x" })) {
      collected.push(c);
    }
    expect(collected.length).toBe(1);
    expect(Array.from(collected[0])).toEqual([9, 9, 9]);
  });

  it("aborts mid-stream when the signal fires — no further chunks yielded", async () => {
    // Stream that emits chunk 1, then waits for `release` before chunk 2.
    let releaseGate!: () => void;
    const gate = new Promise<void>((res) => {
      releaseGate = res;
    });
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        controller.enqueue(new Uint8Array([1]));
        await gate;
        controller.enqueue(new Uint8Array([2]));
        controller.close();
      },
    });
    const invoke = jest
      .fn()
      .mockResolvedValue({ data: stream, error: null });
    const supa = { functions: { invoke } } as unknown as SupabaseClient;
    const adapter = new ElevenLabsTTSAdapter({ supabase: supa });

    const ctrl = new AbortController();
    const collected: Uint8Array[] = [];
    const consume = (async () => {
      for await (const c of adapter.synthesizeStream({
        text: "x",
        signal: ctrl.signal,
      })) {
        collected.push(c);
        if (collected.length === 1) {
          ctrl.abort();
        }
      }
    })();

    await consume;
    // Allow the gated chunk through (it should be ignored).
    releaseGate();
    expect(collected.length).toBe(1);
  });

  it("aborts before invoking when signal is already aborted", async () => {
    const invoke = jest.fn();
    const supa = { functions: { invoke } } as unknown as SupabaseClient;
    const adapter = new ElevenLabsTTSAdapter({ supabase: supa });
    const ctrl = new AbortController();
    ctrl.abort();
    const collected: Uint8Array[] = [];
    for await (const c of adapter.synthesizeStream({
      text: "x",
      signal: ctrl.signal,
    })) {
      collected.push(c);
    }
    expect(collected).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });
});
