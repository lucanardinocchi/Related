/**
 * User Context Builder — ADR-0002. Per Pass, returns a snapshot of the four
 * dynamically-weighted flavours that compose User Context. Slice 7 lands the
 * interface with an empty snapshot; later slices populate the flavours:
 *
 *   Slice 10 — Goals & Values + Situational State
 *   Slice 11 — Inferred Signals: Calendar density
 *   Slice 12 — Inferred Signals: Sleep
 *   Slice 14 — Transient Intent capture
 */

export interface CalendarDensitySignal {
  asOf: string;
  density: number;
}

export interface SleepSignal {
  asOf: string;
  averageHours: number;
}

export interface UserContextSnapshot {
  userId: string;
  asOf: string;
  transientIntent: string[];
  situationalState: string[];
  goalsAndValues: string[];
  inferredSignals: {
    calendarDensity: CalendarDensitySignal | null;
    sleep: SleepSignal | null;
  };
}

export class UserContextBuilder {
  async buildUserContext(
    userId: string,
    asOf: Date,
  ): Promise<UserContextSnapshot> {
    return {
      userId,
      asOf: asOf.toISOString(),
      transientIntent: [],
      situationalState: [],
      goalsAndValues: [],
      inferredSignals: { calendarDensity: null, sleep: null },
    };
  }
}
