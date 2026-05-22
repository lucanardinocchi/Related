import { VoiceSessionManager } from "./VoiceSessionManager";
import { FakeSTTAdapter } from "./FakeSTTAdapter";
import { FakeTTSAdapter } from "./FakeTTSAdapter";

async function* emptyAudio(): AsyncIterable<Uint8Array> {
  // No-op — onUserTurn rejects before consuming audio.
}

describe("VoiceSessionManager.startSession", () => {
  it("returns a SessionHandle exposing onUserTurn / interrupt / close", () => {
    const manager = new VoiceSessionManager({
      sttAdapter: new FakeSTTAdapter(),
      ttsAdapter: new FakeTTSAdapter(),
    });

    const handle = manager.startSession({ relationshipId: "r-1" });
    expect(typeof handle.onUserTurn).toBe("function");
    expect(typeof handle.interrupt).toBe("function");
    expect(typeof handle.close).toBe("function");
    expect(handle.sessionId).toEqual(expect.any(String));
    expect(handle.relationshipId).toBe("r-1");
  });
});

describe("VoiceSessionManager.onUserTurn", () => {
  it("rejects because Engaged Passes are no longer supported", async () => {
    const manager = new VoiceSessionManager({
      sttAdapter: new FakeSTTAdapter(),
      ttsAdapter: new FakeTTSAdapter(),
    });

    const handle = manager.startSession({ relationshipId: "r-1" });

    await expect(handle.onUserTurn(emptyAudio())).rejects.toThrow(
      /Engaged passes are no longer supported/i,
    );
  });
});

describe("VoiceSessionManager.close", () => {
  it("rejects further onUserTurn calls after close", async () => {
    const manager = new VoiceSessionManager({
      sttAdapter: new FakeSTTAdapter(),
      ttsAdapter: new FakeTTSAdapter(),
    });
    const handle = manager.startSession({ relationshipId: "r-1" });

    handle.close();

    await expect(handle.onUserTurn(emptyAudio())).rejects.toThrow(
      /session is closed/,
    );
  });

  it("close() is idempotent and safe when no turn is in flight", () => {
    const manager = new VoiceSessionManager({
      sttAdapter: new FakeSTTAdapter(),
      ttsAdapter: new FakeTTSAdapter(),
    });
    const handle = manager.startSession({ relationshipId: "r-1" });
    expect(() => {
      handle.close();
      handle.close();
    }).not.toThrow();
  });
});
