import { FakeSleepFetcher } from "./FakeSleepFetcher";

describe("FakeSleepFetcher", () => {
  it("returns the configured records deterministically on every fetch", async () => {
    const records = [
      {
        id: "fake-1",
        startedAt: "2026-05-18T22:00:00Z",
        endedAt: "2026-05-19T06:00:00Z",
        durationMinutes: 480,
        quality: null,
      },
    ];
    const fetcher = new FakeSleepFetcher(records);
    expect(await fetcher.fetch(new Date())).toEqual(records);
    expect(await fetcher.fetch(new Date())).toEqual(records);
  });

  it("defaults to an empty array when constructed with no records", async () => {
    const fetcher = new FakeSleepFetcher();
    expect(await fetcher.fetch(new Date())).toEqual([]);
  });

  it("isAvailable() is always true (it's an in-memory fake)", () => {
    expect(new FakeSleepFetcher().isAvailable()).toBe(true);
  });

  it("exposes .fetch as a bound SleepFetcher function", async () => {
    const fetcher = new FakeSleepFetcher([
      {
        id: "fake-1",
        startedAt: "2026-05-18T22:00:00Z",
        endedAt: "2026-05-19T06:00:00Z",
        durationMinutes: 480,
        quality: null,
      },
    ]);
    const fn = fetcher.fetch;
    const out = await fn(new Date());
    expect(out).toHaveLength(1);
  });
});
