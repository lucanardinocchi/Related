import {
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_INTEGRATION_SCOPES,
  GOOGLE_SCOPE_CALENDAR_READONLY,
  googleScopesWithoutCalendar,
  googleScopesWithoutGmail,
  mergeGoogleScopesOnConnect,
  tokenHasCalendarAccess,
  tokenHasGmailAccess,
} from "./googleScopes";

describe("mergeGoogleScopesOnConnect", () => {
  it("adds Gmail scopes without removing calendar when reconnecting Gmail", () => {
    const merged = mergeGoogleScopesOnConnect(
      GOOGLE_CALENDAR_SCOPES,
      "gmail",
    );
    expect(tokenHasCalendarAccess(merged)).toBe(true);
    expect(tokenHasGmailAccess(merged)).toBe(true);
  });

  it("adds calendar without removing Gmail when reconnecting Calendar", () => {
    const gmailOnly = googleScopesWithoutCalendar(GOOGLE_INTEGRATION_SCOPES)!;
    const merged = mergeGoogleScopesOnConnect(gmailOnly, "calendar");
    expect(tokenHasCalendarAccess(merged)).toBe(true);
    expect(tokenHasGmailAccess(merged)).toBe(true);
  });

  it("preserves existing scopes when intent is unknown", () => {
    const merged = mergeGoogleScopesOnConnect(GOOGLE_INTEGRATION_SCOPES, null);
    expect(merged).toBe(GOOGLE_INTEGRATION_SCOPES);
  });

  it("defaults to calendar-only on first connect without intent", () => {
    const merged = mergeGoogleScopesOnConnect(null, null);
    expect(merged).toBe(GOOGLE_CALENDAR_SCOPES);
    expect(tokenHasCalendarAccess(merged)).toBe(true);
    expect(tokenHasGmailAccess(merged)).toBe(false);
  });
});

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
