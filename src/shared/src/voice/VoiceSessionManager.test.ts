import { VoiceSessionManager } from "./VoiceSessionManager";
import { FakeSTTAdapter } from "./FakeSTTAdapter";
import { FakeTTSAdapter } from "./FakeTTSAdapter";
import type { TTSAdapter, TTSSynthesizeInput } from "./TTSAdapter";
import type { AgentService } from "../agent/AgentService";

function fakeAgentService(): jest.Mocked<
  Pick<AgentService, "runEngagedTurn">
> {
  return {
    runEngagedTurn: jest.fn().mockResolvedValue({
      id: "cs-1",
      ownerId: "u-1",
      relationshipId: "r-1",
      mode: "engaged",
      createdAt: "2026-05-19T00:00:00Z",
      actions: [
        {
          type: "DoNothing",
          why: "no changes warrant a Candidate Action this Pass",
        },
      ],
    }),
  };
}

async function* emptyAudio(): AsyncIterable<Uint8Array> {
  // No-op — the FakeSTTAdapter ignores the audio payload and yields a
  // scripted transcript regardless. Real adapters would actually consume
  // the stream.
}

describe("VoiceSessionManager.startSession", () => {
  it("returns a SessionHandle exposing onUserTurn / interrupt / close", () => {
    const manager = new VoiceSessionManager({
      sttAdapter: new FakeSTTAdapter(),
      ttsAdapter: new FakeTTSAdapter(),
      agentService: fakeAgentService() as unknown as AgentService,
    });

    const handle = manager.startSession({ relationshipId: "r-1" });
    expect(typeof handle.onUserTurn).toBe("function");
    expect(typeof handle.interrupt).toBe("function");
    expect(typeof handle.close).toBe("function");
    expect(handle.sessionId).toEqual(expect.any(String));
    expect(handle.relationshipId).toBe("r-1");
  });
});

/**
 * TTS adapter that emits the first chunk immediately and then blocks on
 * a manual release before emitting the second. Lets a test observe
 * partial playback (chunk 1) and then trigger barge-in before chunk 2.
 */
class PausableTTSAdapter implements TTSAdapter {
  private readonly gate: Promise<void>;
  private releaseGate!: () => void;

  constructor() {
    this.gate = new Promise<void>((resolve) => {
      this.releaseGate = resolve;
    });
  }

  async *synthesizeStream(
    input: TTSSynthesizeInput,
  ): AsyncIterable<Uint8Array> {
    // Emit chunk 1 right away.
    if (input.signal?.aborted) return;
    yield new Uint8Array([1]);
    // Block until the test releases (or the signal fires).
    await Promise.race([
      this.gate,
      new Promise<void>((resolve) => {
        if (input.signal) {
          input.signal.addEventListener("abort", () => resolve(), {
            once: true,
          });
        }
      }),
    ]);
    if (input.signal?.aborted) return;
    yield new Uint8Array([2]);
    if (input.signal?.aborted) return;
    yield new Uint8Array([3]);
  }

  release(): void {
    this.releaseGate();
  }
}

describe("VoiceSessionManager.onUserTurn", () => {
  it("flows STT final transcript → Engaged Pass → TTS chunks to the listener", async () => {
    const agentService = fakeAgentService();
    const ttsAdapter = new FakeTTSAdapter({ chunkCount: 3 });
    const manager = new VoiceSessionManager({
      sttAdapter: new FakeSTTAdapter({
        events: [
          { partial: "what's" },
          { partial: "what's up with Sam" },
          { final: "what's up with Sam" },
          { endOfSpeech: true },
        ],
      }),
      ttsAdapter,
      agentService: agentService as unknown as AgentService,
    });

    const handle = manager.startSession({ relationshipId: "r-1" });
    const audioChunks: Uint8Array[] = [];
    handle.onAgentResponse((chunk) => audioChunks.push(chunk));

    const result = await handle.onUserTurn(emptyAudio());

    expect(agentService.runEngagedTurn).toHaveBeenCalledWith({
      relationshipId: "r-1",
      userTurn: "what's up with Sam",
      sessionId: handle.sessionId,
    });
    expect(result.candidateSet.actions).toHaveLength(1);
    expect(audioChunks).toHaveLength(3);
  });

  it("interrupt() cancels the in-flight TTS stream mid-playback", async () => {
    const tts = new PausableTTSAdapter();
    const manager = new VoiceSessionManager({
      sttAdapter: new FakeSTTAdapter(),
      ttsAdapter: tts,
      agentService: fakeAgentService() as unknown as AgentService,
    });

    const handle = manager.startSession({ relationshipId: "r-1" });
    const audioChunks: Uint8Array[] = [];
    handle.onAgentResponse((chunk) => audioChunks.push(chunk));

    const turnPromise = handle.onUserTurn(emptyAudio());

    // Let the pipeline run far enough that chunk 1 has been emitted and
    // the adapter is now blocked on the gate.
    await flushMicrotasks();
    expect(audioChunks).toHaveLength(1);

    // User starts speaking → barge-in. The TTS stream should stop here
    // even though we never release the gate — the abort signal both
    // unblocks the awaiter and prevents the next yield.
    handle.interrupt();

    await expect(turnPromise).rejects.toMatchObject({
      name: "InterruptedError",
    });
    // No additional chunks delivered after interrupt.
    expect(audioChunks).toHaveLength(1);
  });

  it("interrupt() during an in-flight Engaged Pass aborts before any TTS plays", async () => {
    // Agent service blocks indefinitely on the first call so the turn is
    // suspended waiting for the Pass result. interrupt() must reject the
    // turn without ever calling the TTS adapter.
    const blocker = new Promise(() => {
      /* never resolves */
    });
    const agentService = {
      runEngagedTurn: jest.fn().mockReturnValue(blocker),
    };
    const tts = new FakeTTSAdapter({ chunkCount: 3 });
    const ttsSpy = jest.spyOn(tts, "synthesizeStream");

    const manager = new VoiceSessionManager({
      sttAdapter: new FakeSTTAdapter(),
      ttsAdapter: tts,
      agentService: agentService as unknown as AgentService,
    });
    const handle = manager.startSession({ relationshipId: "r-1" });
    const turnPromise = handle.onUserTurn(emptyAudio());

    // Let the pipeline reach the in-flight Engaged Pass.
    await flushMicrotasks();
    expect(agentService.runEngagedTurn).toHaveBeenCalled();
    expect(ttsSpy).not.toHaveBeenCalled();

    handle.interrupt();

    await expect(turnPromise).rejects.toMatchObject({
      name: "InterruptedError",
    });
    expect(ttsSpy).not.toHaveBeenCalled();
  });

  it("after interrupt, a fresh onUserTurn runs normally", async () => {
    const agentService = fakeAgentService();
    const tts = new PausableTTSAdapter();
    const manager = new VoiceSessionManager({
      sttAdapter: new FakeSTTAdapter(),
      ttsAdapter: tts,
      agentService: agentService as unknown as AgentService,
    });
    const handle = manager.startSession({ relationshipId: "r-1" });

    const firstTurn = handle.onUserTurn(emptyAudio());
    await flushMicrotasks();
    handle.interrupt();
    await expect(firstTurn).rejects.toMatchObject({
      name: "InterruptedError",
    });

    // Swap in a fresh, non-blocking TTS for the second turn by replacing
    // the adapter would require manager rebuild; instead just confirm
    // the second call enters the pipeline and the agent service was
    // invoked twice — the session is still alive.
    const secondCallStarted = handle.onUserTurn(emptyAudio()).catch(() => {
      /* don't care about resolution — only that it gets started */
    });
    await flushMicrotasks();
    expect(agentService.runEngagedTurn).toHaveBeenCalledTimes(2);
    handle.close();
    await secondCallStarted;
  });
});

describe("VoiceSessionManager.close", () => {
  it("aborts any in-flight turn and rejects further onUserTurn calls", async () => {
    const tts = new PausableTTSAdapter();
    const manager = new VoiceSessionManager({
      sttAdapter: new FakeSTTAdapter(),
      ttsAdapter: tts,
      agentService: fakeAgentService() as unknown as AgentService,
    });
    const handle = manager.startSession({ relationshipId: "r-1" });
    const audioChunks: Uint8Array[] = [];
    handle.onAgentResponse((chunk) => audioChunks.push(chunk));

    const turnPromise = handle.onUserTurn(emptyAudio());
    await flushMicrotasks();
    expect(audioChunks).toHaveLength(1);

    handle.close();

    await expect(turnPromise).rejects.toMatchObject({
      name: "InterruptedError",
    });
    await expect(handle.onUserTurn(emptyAudio())).rejects.toThrow(
      /session is closed/,
    );
  });

  it("close() is idempotent and safe when no turn is in flight", () => {
    const manager = new VoiceSessionManager({
      sttAdapter: new FakeSTTAdapter(),
      ttsAdapter: new FakeTTSAdapter(),
      agentService: fakeAgentService() as unknown as AgentService,
    });
    const handle = manager.startSession({ relationshipId: "r-1" });
    expect(() => {
      handle.close();
      handle.close();
    }).not.toThrow();
  });
});

async function flushMicrotasks(): Promise<void> {
  // Multiple cycles so async generator state machines settle through
  // STT → agent call → TTS first chunk.
  for (let i = 0; i < 50; i++) {
    await Promise.resolve();
  }
}
