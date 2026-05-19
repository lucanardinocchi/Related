import type { RawSleepRecord } from "./sleepSummary";
import { PlatformSleepFetcher } from "./PlatformSleepFetcher";

describe("PlatformSleepFetcher", () => {
  // Each test runs against a clean adapter slot — the setter is module
  // state, so reset it between tests to keep them order-independent.
  afterEach(() => {
    PlatformSleepFetcher.setIosHealthKitAdapter(null);
  });

  it("returns an empty array on Android (HealthKit is iOS-only in v1)", async () => {
    const fetcher = new PlatformSleepFetcher({ platform: "android" });
    expect(await fetcher.fetch(new Date())).toEqual([]);
  });

  it("returns an empty array on web (no HealthKit)", async () => {
    const fetcher = new PlatformSleepFetcher({ platform: "web" });
    expect(await fetcher.fetch(new Date())).toEqual([]);
  });

  it("returns an empty array on iOS when no HealthKit adapter has been installed", async () => {
    const fetcher = new PlatformSleepFetcher({ platform: "ios" });
    expect(await fetcher.fetch(new Date())).toEqual([]);
  });

  it("delegates to the installed iOS HealthKit adapter on iOS", async () => {
    const sample: RawSleepRecord[] = [
      {
        id: "hk-1",
        startedAt: "2026-05-19T22:30:00.000Z",
        endedAt: "2026-05-20T06:30:00.000Z",
        durationMinutes: 480,
        quality: "asleepCore",
      },
    ];
    const adapter = jest.fn().mockResolvedValue(sample);
    PlatformSleepFetcher.setIosHealthKitAdapter(adapter);

    const fetcher = new PlatformSleepFetcher({ platform: "ios" });
    const asOf = new Date("2026-05-20T08:00:00.000Z");
    const result = await fetcher.fetch(asOf);

    expect(adapter).toHaveBeenCalledWith(asOf);
    expect(result).toEqual(sample);
  });

  it("ignores the iOS HealthKit adapter on web/Android (shared lib stays platform-agnostic)", async () => {
    const adapter = jest.fn().mockResolvedValue([
      {
        id: "should-not-be-used",
        startedAt: "2026-05-19T22:30:00.000Z",
        endedAt: "2026-05-20T06:30:00.000Z",
        durationMinutes: 480,
        quality: "asleepCore",
      },
    ]);
    PlatformSleepFetcher.setIosHealthKitAdapter(adapter);

    const web = new PlatformSleepFetcher({ platform: "web" });
    const android = new PlatformSleepFetcher({ platform: "android" });
    expect(await web.fetch(new Date())).toEqual([]);
    expect(await android.fetch(new Date())).toEqual([]);
    expect(adapter).not.toHaveBeenCalled();
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
