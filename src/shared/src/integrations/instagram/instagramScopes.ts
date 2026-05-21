/**
 * Instagram Login OAuth scopes for the Messaging API (creator/pro accounts).
 * Stored verbatim on user_provider_tokens.scopes after connect.
 */

export const INSTAGRAM_SCOPE_BASIC = "instagram_business_basic";

export const INSTAGRAM_SCOPE_MANAGE_MESSAGES =
  "instagram_business_manage_messages";

export const INSTAGRAM_INTEGRATION_SCOPES = [
  INSTAGRAM_SCOPE_BASIC,
  INSTAGRAM_SCOPE_MANAGE_MESSAGES,
].join(",");

export function tokenHasInstagramAccess(
  scopes: string | null | undefined,
): boolean {
  if (!scopes) return false;
  return (
    scopes.includes(INSTAGRAM_SCOPE_BASIC) &&
    scopes.includes(INSTAGRAM_SCOPE_MANAGE_MESSAGES)
  );
}
