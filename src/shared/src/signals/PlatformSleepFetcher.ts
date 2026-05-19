import type { RawSleepRecord } from "./sleepSummary";
import type { SleepFetcher } from "./SleepCollector";

/**
 * Provider-agnostic Sleep fetcher. Implements the `SleepFetcher`
 * function-type via the `.fetch` method bound below, so it can be
 * passed straight into `SleepCollector`.
 *
 * In v1 the Sleep signal is iOS-only (HealthKit). Android (Health
 * Connect / Google Fit) and web are deferred per the PRD.
 *
 * This class is the single integration point the rest of the app
 * depends on. When the HealthKit native module ships (Expo config
 * plugin + a thin Swift bridge), the only change is inside
 * `fetchIos()` — every collector / cron / Edge Function stays the
 * same.
 */

export type SleepPlatform = "ios" | "android" | "web";

export interface PlatformSleepFetcherOptions {
  platform: SleepPlatform;
}

export class PlatformSleepFetcher {
  private readonly platform: SleepPlatform;

  constructor(opts: PlatformSleepFetcherOptions) {
    this.platform = opts.platform;
  }

  /**
   * Bound so it can be passed as a `SleepFetcher` function value.
   */
  fetch: SleepFetcher = async (asOf: Date): Promise<RawSleepRecord[]> => {
    if (this.platform === "ios") {
      return this.fetchIos(asOf);
    }
    // Android / web: iOS-only in v1 per PRD. Health Connect / Google
    // Fit (Android) is tracked on the Slice 12 follow-up issue.
    return [];
  };

  /**
   * True only on iOS, where a real HealthKit fetcher *would* be
   * reachable. Useful for UI gating ("Sleep signal: iOS only in v1")
   * and for dev-mode toggles.
   */
  isAvailable(): boolean {
    return this.platform === "ios";
  }

  /**
   * iOS integration point. Today this returns an empty array — the
   * real HealthKit query (HKCategoryTypeIdentifierSleepAnalysis) is
   * blocked on a native module Luca has to add via an Expo config
   * plugin on a Mac with Xcode. When that lands, swap the body of
   * this method for the bridged call. The rest of the pipeline
   * (collector, cron, builder) needs no change.
   */
  private async fetchIos(_asOf: Date): Promise<RawSleepRecord[]> {
    return [];
  }
}
