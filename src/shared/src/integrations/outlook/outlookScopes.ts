/**
 * Microsoft Graph OAuth scopes for Outlook Calendar + Mail.
 * Stored verbatim on user_provider_tokens.scopes after connect.
 */

export const OUTLOOK_SCOPE_CALENDARS_READ = "Calendars.Read";
export const OUTLOOK_SCOPE_MAIL_READ = "Mail.Read";
export const OUTLOOK_SCOPE_MAIL_SEND = "Mail.Send";
export const OUTLOOK_SCOPE_OFFLINE_ACCESS = "offline_access";
export const OUTLOOK_SCOPE_USER_READ = "User.Read";

/** Calendar-only — legacy connects before mail scopes shipped. */
export const OUTLOOK_CALENDAR_SCOPES = [
  OUTLOOK_SCOPE_CALENDARS_READ,
  OUTLOOK_SCOPE_OFFLINE_ACCESS,
  OUTLOOK_SCOPE_USER_READ,
].join(" ");

/** Calendar + Mail — requested on Connect Outlook from Settings / onboarding. */
export const OUTLOOK_INTEGRATION_SCOPES = [
  OUTLOOK_SCOPE_CALENDARS_READ,
  OUTLOOK_SCOPE_MAIL_READ,
  OUTLOOK_SCOPE_MAIL_SEND,
  OUTLOOK_SCOPE_OFFLINE_ACCESS,
  OUTLOOK_SCOPE_USER_READ,
].join(" ");

export function tokenHasOutlookCalendarAccess(
  scopes: string | null | undefined,
): boolean {
  if (!scopes) return false;
  return scopes.includes(OUTLOOK_SCOPE_CALENDARS_READ);
}

export function tokenHasOutlookMailAccess(
  scopes: string | null | undefined,
): boolean {
  if (!scopes) return false;
  return (
    scopes.includes(OUTLOOK_SCOPE_MAIL_READ) &&
    scopes.includes(OUTLOOK_SCOPE_MAIL_SEND)
  );
}
