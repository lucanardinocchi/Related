/** Historical + future horizon synced on connect and full reconcile runs. */
export const CALENDAR_HISTORY_DAYS = 365;
/** Practical upper bound for "all upcoming" — Graph/Calendar APIs need a finite timeMax. */
export const CALENDAR_FUTURE_DAYS = 730;

export interface CalendarSyncWindow {
  timeMin: Date;
  timeMax: Date;
}

export function buildCalendarSyncWindow(
  referenceDate: Date = new Date(),
): CalendarSyncWindow {
  const timeMin = new Date(referenceDate);
  timeMin.setUTCDate(timeMin.getUTCDate() - CALENDAR_HISTORY_DAYS);
  const timeMax = new Date(referenceDate);
  timeMax.setUTCDate(timeMax.getUTCDate() + CALENDAR_FUTURE_DAYS);
  return { timeMin, timeMax };
}
