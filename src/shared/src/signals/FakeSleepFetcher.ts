import type { RawSleepRecord } from "./sleepSummary";
import type { SleepFetcher } from "./SleepCollector";

/**
 * Deterministic SleepFetcher used by tests and by a "demo / dev"
 * mode where we want the agent to have a Sleep signal without a real
 * HealthKit fetch in place.
 *
 * Same shape as PlatformSleepFetcher: a class with a bound `fetch`
 * field that satisfies the `SleepFetcher` function-type.
 */
export class FakeSleepFetcher {
  private readonly records: RawSleepRecord[];

  constructor(records: RawSleepRecord[] = []) {
    this.records = records;
  }

  fetch: SleepFetcher = async (_asOf: Date): Promise<RawSleepRecord[]> => {
    // Return a defensive copy so tests / callers can't mutate the
    // configured set across calls.
    return this.records.map((r) => ({ ...r }));
  };

  isAvailable(): boolean {
    return true;
  }
}
