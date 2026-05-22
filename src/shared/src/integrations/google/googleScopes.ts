/**
 * Google OAuth scopes for Related integrations (Calendar + Gmail).
 * Stored verbatim on user_provider_tokens.scopes after connect.
 */

export const GOOGLE_SCOPE_CALENDAR_READONLY =
  "https://www.googleapis.com/auth/calendar.readonly";

export const GOOGLE_SCOPE_GMAIL_READONLY =
  "https://www.googleapis.com/auth/gmail.readonly";

export const GOOGLE_SCOPE_GMAIL_SEND =
  "https://www.googleapis.com/auth/gmail.send";

/** Calendar-only — web/mobile onboarding today. */
export const GOOGLE_CALENDAR_SCOPES = GOOGLE_SCOPE_CALENDAR_READONLY;

/** Calendar + Gmail — requested when the User connects Gmail from a Contact. */
export const GOOGLE_INTEGRATION_SCOPES = [
  GOOGLE_SCOPE_CALENDAR_READONLY,
  GOOGLE_SCOPE_GMAIL_READONLY,
  GOOGLE_SCOPE_GMAIL_SEND,
].join(" ");

export function tokenHasGmailAccess(scopes: string | null | undefined): boolean {
  if (!scopes) return false;
  return (
    scopes.includes(GOOGLE_SCOPE_GMAIL_READONLY) &&
    scopes.includes(GOOGLE_SCOPE_GMAIL_SEND)
  );
}

export function tokenHasCalendarAccess(
  scopes: string | null | undefined,
): boolean {
  if (!scopes) return false;
  return scopes.includes(GOOGLE_SCOPE_CALENDAR_READONLY);
}

/** Returns remaining scopes after removing Calendar, or null if none left. */
export function googleScopesWithoutCalendar(scopes: string): string | null {
  const remaining = scopes
    .split(/\s+/)
    .filter((s) => s.length > 0 && s !== GOOGLE_SCOPE_CALENDAR_READONLY);
  return remaining.length > 0 ? remaining.join(" ") : null;
}

export type GoogleConnectIntent = "calendar" | "gmail";

function parseScopeList(scopes: string | null | undefined): string[] {
  return (scopes ?? "").split(/\s+/).filter((s) => s.length > 0);
}

/**
 * Merges scopes granted by a new Google connect into any existing row.
 * Re-connecting Calendar must not drop Gmail (and vice versa).
 */
export function mergeGoogleScopesOnConnect(
  existingScopes: string | null | undefined,
  intent: GoogleConnectIntent | null,
): string {
  const existing = parseScopeList(existingScopes);
  const granted =
    intent === "gmail"
      ? parseScopeList(GOOGLE_INTEGRATION_SCOPES)
      : intent === "calendar"
        ? parseScopeList(GOOGLE_CALENDAR_SCOPES)
        : [];
  if (granted.length === 0) {
    if (existing.length > 0) return existing.join(" ");
    return GOOGLE_CALENDAR_SCOPES;
  }
  return [...new Set([...existing, ...granted])].join(" ");
}

/** Returns remaining scopes after removing Gmail, or null if none left. */
export function googleScopesWithoutGmail(scopes: string): string | null {
  const remaining = scopes
    .split(/\s+/)
    .filter(
      (s) =>
        s.length > 0 &&
        s !== GOOGLE_SCOPE_GMAIL_READONLY &&
        s !== GOOGLE_SCOPE_GMAIL_SEND,
    );
  return remaining.length > 0 ? remaining.join(" ") : null;
}
