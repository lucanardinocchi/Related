import {
  GOOGLE_INTEGRATION_SCOPES,
  GOOGLE_SCOPE_CALENDAR_READONLY,
  googleScopesWithoutCalendar,
  googleScopesWithoutGmail,
  tokenHasCalendarAccess,
  tokenHasGmailAccess,
} from "./googleScopes";

describe("googleScopesWithoutCalendar", () => {
  it("removes calendar scope but keeps Gmail scopes", () => {
    const remaining = googleScopesWithoutCalendar(GOOGLE_INTEGRATION_SCOPES);
    expect(remaining).not.toBeNull();
    expect(tokenHasGmailAccess(remaining)).toBe(true);
    expect(tokenHasCalendarAccess(remaining)).toBe(false);
  });

  it("returns null when only calendar was granted", () => {
    expect(googleScopesWithoutCalendar(GOOGLE_SCOPE_CALENDAR_READONLY)).toBeNull();
  });
});

describe("googleScopesWithoutGmail", () => {
  it("removes Gmail scopes but keeps calendar", () => {
    const remaining = googleScopesWithoutGmail(GOOGLE_INTEGRATION_SCOPES);
    expect(remaining).toBe(GOOGLE_SCOPE_CALENDAR_READONLY);
    expect(tokenHasCalendarAccess(remaining)).toBe(true);
    expect(tokenHasGmailAccess(remaining)).toBe(false);
  });
});
