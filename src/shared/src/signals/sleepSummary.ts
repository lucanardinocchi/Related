/**
 * Sleep summariser per Slice 12 / ADR-0002. Reduces the raw last-3-days
 * sleep records into a Pass-prompt-shaped signal:
 *
 *   - averageHours: mean nightly duration across the window
 *   - lastNightHours: most recent night's duration
 *   - unusualLastNight: true if last-night is >2h below the prior nights' average
 *   - bucket: 'well_rested' (≥7h avg) | 'mixed' (6–7h) | 'deprived' (<6h)
 *   - focus48hHint: short human-readable hint for the prompt's next-48h focus
 */

export interface RawSleepRecord {
  id: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  quality: string | null;
}

export type SleepBucket = "well_rested" | "mixed" | "deprived" | "unavailable";

export interface SleepSignal {
  asOf: string;
  nights: number;
  averageHours: number;
  lastNightHours: number;
  unusualLastNight: boolean;
  bucket: SleepBucket;
  focus48hHint: string;
}

const WINDOW_DAYS = 3;
const UNUSUAL_DELTA_HOURS = 2;

function inWindow(record: RawSleepRecord, asOf: Date): boolean {
  const start = new Date(record.startedAt);
  const cutoff = new Date(asOf);
  cutoff.setUTCDate(cutoff.getUTCDate() - WINDOW_DAYS);
  return start >= cutoff && start <= asOf;
}

function bucketFor(avg: number): SleepBucket {
  if (avg <= 0) return "unavailable";
  if (avg >= 7) return "well_rested";
  if (avg >= 6) return "mixed";
  return "deprived";
}

function focus48hHintFor(bucket: SleepBucket, unusualLastNight: boolean): string {
  if (unusualLastNight) {
    return "Last night was unusually short — flag lower social capacity for the next 48h.";
  }
  switch (bucket) {
    case "well_rested":
      return "Sleep looks solid — normal social capacity for the next 48h.";
    case "mixed":
      return "Sleep is mixed — moderate social capacity for the next 48h; prefer lower-effort plans.";
    case "deprived":
      return "Sleep is short — assume reduced energy / social capacity for the next 48h.";
    case "unavailable":
      return "Sleep signal unavailable.";
  }
}

export function summariseSleep(
  records: RawSleepRecord[],
  asOf: Date,
): SleepSignal {
  const inRange = records
    .filter((r) => inWindow(r, asOf))
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );

  if (inRange.length === 0) {
    return {
      asOf: asOf.toISOString(),
      nights: 0,
      averageHours: 0,
      lastNightHours: 0,
      unusualLastNight: false,
      bucket: "unavailable",
      focus48hHint: focus48hHintFor("unavailable", false),
    };
  }

  const totalMinutes = inRange.reduce((acc, r) => acc + r.durationMinutes, 0);
  const averageHours = Math.round((totalMinutes / inRange.length / 60) * 100) / 100;
  const lastNightHours = Math.round((inRange[0].durationMinutes / 60) * 100) / 100;

  // Unusual = last night >UNUSUAL_DELTA_HOURS below prior-nights average.
  let unusualLastNight = false;
  if (inRange.length >= 2) {
    const priorMinutes = inRange
      .slice(1)
      .reduce((acc, r) => acc + r.durationMinutes, 0);
    const priorAvgHours = priorMinutes / (inRange.length - 1) / 60;
    if (priorAvgHours - lastNightHours >= UNUSUAL_DELTA_HOURS) {
      unusualLastNight = true;
    }
  }

  const bucket = bucketFor(averageHours);
  return {
    asOf: asOf.toISOString(),
    nights: inRange.length,
    averageHours,
    lastNightHours,
    unusualLastNight,
    bucket,
    focus48hHint: focus48hHintFor(bucket, unusualLastNight),
  };
}
