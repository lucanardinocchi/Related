import { buildCalendarSyncWindow, CALENDAR_FUTURE_DAYS, CALENDAR_HISTORY_DAYS } from "./calendarSyncConfig";

describe("buildCalendarSyncWindow", () => {
  it("spans one year back and two years forward from reference date", () => {
    const ref = new Date("2026-05-22T12:00:00Z");
    const { timeMin, timeMax } = buildCalendarSyncWindow(ref);

    const min = new Date(ref);
    min.setUTCDate(min.getUTCDate() - CALENDAR_HISTORY_DAYS);
    const max = new Date(ref);
    max.setUTCDate(max.getUTCDate() + CALENDAR_FUTURE_DAYS);

    expect(timeMin.toISOString()).toBe(min.toISOString());
    expect(timeMax.toISOString()).toBe(max.toISOString());
  });
});
