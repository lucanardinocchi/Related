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
  /**
   * Module-level slot for the iOS HealthKit adapter. The shared library
   * is Expo-free by policy — it can't `require` a native module — so
   * the mobile app installs the real bridge here at bootstrap on
   * `Platform.OS === 'ios'`. On every other platform the slot stays
   * null and `fetchIos` returns an empty array.
   *
   * Static / module state is acceptable here because there is exactly
   * one HealthKit bridge per process, identical to how
   * `Linking.openURL` or other native singletons work.
   */
  private static iosHealthKitAdapter: SleepFetcher | null = null;

  static setIosHealthKitAdapter(adapter: SleepFetcher | null): void {
    PlatformSleepFetcher.iosHealthKitAdapter = adapter;
  }

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
   * iOS integration point. Delegates to the installed HealthKit
   * adapter when present (mobile app wires the native bridge in at
   * bootstrap), or returns [] when no adapter is installed (e.g.
   * shared-lib unit tests, Edge Functions running server-side).
   */
  private async fetchIos(asOf: Date): Promise<RawSleepRecord[]> {
    const adapter = PlatformSleepFetcher.iosHealthKitAdapter;
    if (!adapter) return [];
    return adapter(asOf);
  }
}
