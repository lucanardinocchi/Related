/**
 * Microsoft Graph OAuth scopes for Outlook Calendar (read-only).
 * Stored verbatim on user_provider_tokens.scopes after connect.
 */

export const OUTLOOK_SCOPE_CALENDARS_READ = "Calendars.Read";
export const OUTLOOK_SCOPE_OFFLINE_ACCESS = "offline_access";
export const OUTLOOK_SCOPE_USER_READ = "User.Read";

export const OUTLOOK_CALENDAR_SCOPES = [
  OUTLOOK_SCOPE_CALENDARS_READ,
  OUTLOOK_SCOPE_OFFLINE_ACCESS,
  OUTLOOK_SCOPE_USER_READ,
].join(" ");

export function tokenHasOutlookCalendarAccess(
  scopes: string | null | undefined,
): boolean {
  if (!scopes) return false;
  return scopes.includes(OUTLOOK_SCOPE_CALENDARS_READ);
}
