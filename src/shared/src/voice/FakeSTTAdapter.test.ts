import { FakeSTTAdapter } from "./FakeSTTAdapter";

async function* emptyAudio(): AsyncIterable<Uint8Array> {}

describe("FakeSTTAdapter", () => {
  it("yields scripted events in order ending with endOfSpeech", async () => {
    const adapter = new FakeSTTAdapter({
      events: [
        { partial: "hi" },
        { partial: "hi there" },
        { final: "hi there" },
        { endOfSpeech: true },
      ],
    });
    const collected = [] as Array<unknown>;
    for await (const event of adapter.transcribeStream({
      audio: emptyAudio(),
    })) {
      collected.push(event);
    }
    expect(collected).toEqual([
      { partial: "hi" },
      { partial: "hi there" },
      { final: "hi there" },
      { endOfSpeech: true },
    ]);
  });

  it("stops yielding once the abort signal fires", async () => {
    const adapter = new FakeSTTAdapter({
      events: [{ partial: "a" }, { partial: "b" }, { final: "c" }],
    });
    const controller = new AbortController();
    controller.abort();
    const collected = [] as Array<unknown>;
    for await (const event of adapter.transcribeStream({
      audio: emptyAudio(),
      signal: controller.signal,
    })) {
      collected.push(event);
    }
    expect(collected).toEqual([]);
  });
});
