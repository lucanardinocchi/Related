import { summariseSleep, type RawSleepRecord } from "./sleepSummary";

const ASOF = new Date("2026-05-19T08:00:00Z");

function rec(over: Partial<RawSleepRecord> & { startedAt: string; endedAt: string; durationMinutes: number }): RawSleepRecord {
  return {
    id: "rec",
    quality: null,
    ...over,
  };
}

describe("summariseSleep", () => {
  it("well-rested: 3 nights averaging ≥7h flagged as 'well_rested'", () => {
    const r = summariseSleep(
      [
        rec({ startedAt: "2026-05-16T22:00:00Z", endedAt: "2026-05-17T06:00:00Z", durationMinutes: 480 }),
        rec({ startedAt: "2026-05-17T22:30:00Z", endedAt: "2026-05-18T06:30:00Z", durationMinutes: 480 }),
        rec({ startedAt: "2026-05-18T22:00:00Z", endedAt: "2026-05-19T06:00:00Z", durationMinutes: 480 }),
      ],
      ASOF,
    );
    expect(r.bucket).toBe("well_rested");
    expect(r.averageHours).toBe(8);
    expect(r.lastNightHours).toBe(8);
  });

  it("sleep-deprived: 3 nights averaging <6h flagged as 'deprived'", () => {
    // All three start within the 3-day backward window (cutoff = ASOF − 3 days).
    const r = summariseSleep(
      [
        rec({ startedAt: "2026-05-16T23:00:00Z", endedAt: "2026-05-17T03:00:00Z", durationMinutes: 240 }),
        rec({ startedAt: "2026-05-17T23:00:00Z", endedAt: "2026-05-18T04:00:00Z", durationMinutes: 300 }),
        rec({ startedAt: "2026-05-18T23:00:00Z", endedAt: "2026-05-19T03:30:00Z", durationMinutes: 270 }),
      ],
      ASOF,
    );
    expect(r.bucket).toBe("deprived");
    expect(r.averageHours).toBeCloseTo(4.5);
  });

  it("mixed: average between 6–7h is 'mixed'", () => {
    const r = summariseSleep(
      [
        rec({ startedAt: "2026-05-16T23:00:00Z", endedAt: "2026-05-17T05:00:00Z", durationMinutes: 360 }),
        rec({ startedAt: "2026-05-17T22:00:00Z", endedAt: "2026-05-18T05:00:00Z", durationMinutes: 420 }),
        rec({ startedAt: "2026-05-18T23:00:00Z", endedAt: "2026-05-19T05:30:00Z", durationMinutes: 390 }),
      ],
      ASOF,
    );
    expect(r.bucket).toBe("mixed");
  });

  it("flags unusual nights when last-night sleep is >2h below the prior-2-night average", () => {
    const r = summariseSleep(
      [
        rec({ startedAt: "2026-05-16T22:00:00Z", endedAt: "2026-05-17T06:00:00Z", durationMinutes: 480 }),
        rec({ startedAt: "2026-05-17T22:30:00Z", endedAt: "2026-05-18T07:00:00Z", durationMinutes: 510 }),
        // Last night: 4h — well below the prior average
        rec({ startedAt: "2026-05-19T02:00:00Z", endedAt: "2026-05-19T06:00:00Z", durationMinutes: 240 }),
      ],
      ASOF,
    );
    expect(r.lastNightHours).toBe(4);
    expect(r.unusualLastNight).toBe(true);
  });

  it("ignores records outside the 3-day backward window", () => {
    const r = summariseSleep(
      [
        rec({ startedAt: "2026-04-01T22:00:00Z", endedAt: "2026-04-02T06:00:00Z", durationMinutes: 480 }),
        rec({ startedAt: "2026-05-18T22:00:00Z", endedAt: "2026-05-19T06:00:00Z", durationMinutes: 480 }),
      ],
      ASOF,
    );
    expect(r.nights).toBe(1);
  });

  it("focus48hHint summarises the next-48h capacity implication", () => {
    const r = summariseSleep(
      [
        rec({ startedAt: "2026-05-16T22:00:00Z", endedAt: "2026-05-17T06:00:00Z", durationMinutes: 480 }),
        rec({ startedAt: "2026-05-17T22:00:00Z", endedAt: "2026-05-18T06:00:00Z", durationMinutes: 480 }),
        rec({ startedAt: "2026-05-19T02:00:00Z", endedAt: "2026-05-19T06:00:00Z", durationMinutes: 240 }),
      ],
      ASOF,
    );
    // The focus hint is a short string the prompt can use verbatim.
    expect(r.focus48hHint).toMatch(/social capacity|energy|sleep/i);
  });
});
