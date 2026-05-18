/**
 * Calendar density summariser per Slice 11 / ADR-0002. Reduces the raw
 * 7-day forward event window into a Pass-prompt-shaped signal:
 *
 *   - density: total event hours across the 7-day window
 *   - next72hHours: same metric restricted to the next 72 hours
 *     (the slice brief explicitly emphasises this window in prompts)
 *   - bucket: rough qualitative label ('free' | 'light' | 'busy' | 'packed')
 *
 * Heuristics:
 *   - All-day events count as 8 hours each (working-day approximation,
 *     not clock truth — calendars often mark whole days for travel,
 *     birthdays, OOO, etc).
 *   - Multi-day events are clipped to the visible window so they don't
 *     inflate the density artificially.
 *   - Buckets: <0.5h free, <10h light, <25h busy, ≥25h packed.
 */

export interface RawCalendarEvent {
  id: string;
  title?: string;
  start: string;
  end: string;
  isAllDay: boolean;
}

export type CalendarDensityBucket = "free" | "light" | "busy" | "packed";

export interface CalendarDensitySignal {
  asOf: string;
  density: number;
  next72hHours: number;
  bucket: CalendarDensityBucket;
}

const WINDOW_DAYS = 7;
const NEXT_HOURS_FOCUS = 72;
const ALL_DAY_WORKING_HOURS = 8;

function hoursBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / (1000 * 60 * 60));
}

function clip(start: Date, end: Date, windowStart: Date, windowEnd: Date): [Date, Date] | null {
  const s = start < windowStart ? windowStart : start;
  const e = end > windowEnd ? windowEnd : end;
  if (e <= s) return null;
  return [s, e];
}

function eventHours(event: RawCalendarEvent, windowStart: Date, windowEnd: Date): number {
  if (event.isAllDay) {
    const start = new Date(event.start);
    const end = new Date(event.end);
    // Count one ALL_DAY_WORKING_HOURS slot per day that overlaps the window.
    const clipped = clip(start, end, windowStart, windowEnd);
    if (!clipped) return 0;
    const days = Math.max(
      1,
      Math.ceil((clipped[1].getTime() - clipped[0].getTime()) / (1000 * 60 * 60 * 24)),
    );
    return days * ALL_DAY_WORKING_HOURS;
  }
  const clipped = clip(new Date(event.start), new Date(event.end), windowStart, windowEnd);
  if (!clipped) return 0;
  return hoursBetween(clipped[0], clipped[1]);
}

function bucketFor(densityHours: number): CalendarDensityBucket {
  if (densityHours < 0.5) return "free";
  if (densityHours < 10) return "light";
  if (densityHours < 25) return "busy";
  return "packed";
}

export function summariseCalendarDensity(
  events: RawCalendarEvent[],
  asOf: Date,
): CalendarDensitySignal {
  const windowEnd = new Date(asOf);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + WINDOW_DAYS);
  const focusEnd = new Date(asOf);
  focusEnd.setUTCHours(focusEnd.getUTCHours() + NEXT_HOURS_FOCUS);

  let density = 0;
  let next72hHours = 0;
  for (const event of events) {
    density += eventHours(event, asOf, windowEnd);
    next72hHours += eventHours(event, asOf, focusEnd);
  }

  return {
    asOf: asOf.toISOString(),
    density,
    next72hHours,
    bucket: bucketFor(density),
  };
}
