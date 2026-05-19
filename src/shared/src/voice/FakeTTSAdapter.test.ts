import { FakeTTSAdapter } from "./FakeTTSAdapter";

describe("FakeTTSAdapter", () => {
  it("yields the configured number of chunks", async () => {
    const adapter = new FakeTTSAdapter({ chunkCount: 4, chunkSize: 2 });
    const chunks: Uint8Array[] = [];
    for await (const chunk of adapter.synthesizeStream({ text: "hello" })) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(4);
    for (const c of chunks) expect(c.byteLength).toBe(2);
  });

  it("yields nothing when the signal is already aborted", async () => {
    const adapter = new FakeTTSAdapter({ chunkCount: 3 });
    const controller = new AbortController();
    controller.abort();
    const chunks: Uint8Array[] = [];
    for await (const chunk of adapter.synthesizeStream({
      text: "hi",
      signal: controller.signal,
    })) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([]);
  });
});
