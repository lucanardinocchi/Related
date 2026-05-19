import { PlatformSleepFetcher } from "./PlatformSleepFetcher";

describe("PlatformSleepFetcher", () => {
  it("returns an empty array on Android (HealthKit is iOS-only in v1)", async () => {
    const fetcher = new PlatformSleepFetcher({ platform: "android" });
    expect(await fetcher.fetch(new Date())).toEqual([]);
  });

  it("returns an empty array on web (no HealthKit)", async () => {
    const fetcher = new PlatformSleepFetcher({ platform: "web" });
    expect(await fetcher.fetch(new Date())).toEqual([]);
  });

  it("returns an empty array on iOS today (HealthKit native module not yet wired)", async () => {
    const fetcher = new PlatformSleepFetcher({ platform: "ios" });
    expect(await fetcher.fetch(new Date())).toEqual([]);
  });

  it("reports isAvailable=true only on iOS", () => {
    expect(new PlatformSleepFetcher({ platform: "ios" }).isAvailable()).toBe(true);
    expect(new PlatformSleepFetcher({ platform: "android" }).isAvailable()).toBe(false);
    expect(new PlatformSleepFetcher({ platform: "web" }).isAvailable()).toBe(false);
  });

  it("can be passed as a SleepFetcher function directly to a collector", async () => {
    // Smoke check the SleepFetcher binding — .fetch is shape-compatible
    // with the (asOf: Date) => Promise<RawSleepRecord[]> signature.
    const fetcher = new PlatformSleepFetcher({ platform: "ios" });
    const fn: (asOf: Date) => Promise<unknown[]> = fetcher.fetch;
    expect(await fn(new Date())).toEqual([]);
  });
});
