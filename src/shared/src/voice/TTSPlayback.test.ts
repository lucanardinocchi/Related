import { createTTSPlayback } from "./TTSPlayback";
import type { TTSAdapter } from "./TTSAdapter";

class StubTTSAdapter implements TTSAdapter {
  public lastText: string | null = null;
  async *synthesizeStream({ text }: { text: string }): AsyncIterable<Uint8Array> {
    this.lastText = text;
    yield new Uint8Array([0x10, 0x11]);
    yield new Uint8Array([0x12]);
  }
}

describe("TTSPlayback", () => {
  it("synthesises text and forwards the concatenated bytes to the player", async () => {
    const tts = new StubTTSAdapter();
    const player = { play: jest.fn().mockResolvedValue(undefined), stop: jest.fn() };
    const playback = createTTSPlayback({
      ttsAdapter: tts,
      player,
      getMuted: () => false,
    });

    await playback.play("hello there");

    expect(tts.lastText).toBe("hello there");
    expect(player.play).toHaveBeenCalledTimes(1);
    const [bytes] = player.play.mock.calls[0];
    expect(Array.from(bytes as Uint8Array)).toEqual([0x10, 0x11, 0x12]);
  });

  it("is a no-op when muted — does not invoke the TTS adapter or the player", async () => {
    const tts = new StubTTSAdapter();
    const synthesizeSpy = jest.spyOn(tts, "synthesizeStream");
    const player = { play: jest.fn(), stop: jest.fn() };
    const playback = createTTSPlayback({
      ttsAdapter: tts,
      player,
      getMuted: () => true,
    });

    await playback.play("hello there");

    expect(synthesizeSpy).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });
});
