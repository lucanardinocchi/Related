/**
 * TikTok Login Kit OAuth scopes.
 * Stored verbatim on user_provider_tokens.scopes after connect.
 *
 * Business Messaging API access is configured separately via
 * TIKTOK_BUSINESS_ID and requires TikTok Business Messaging app review.
 */

export const TIKTOK_SCOPE_USER_INFO_BASIC = "user.info.basic";
export const TIKTOK_SCOPE_USER_INFO_PROFILE = "user.info.profile";

export const TIKTOK_INTEGRATION_SCOPES = [
  TIKTOK_SCOPE_USER_INFO_BASIC,
  TIKTOK_SCOPE_USER_INFO_PROFILE,
].join(",");

export function tokenHasTikTokAccess(
  scopes: string | null | undefined,
): boolean {
  if (!scopes) return false;
  return (
    scopes.includes(TIKTOK_SCOPE_USER_INFO_BASIC) &&
    scopes.includes(TIKTOK_SCOPE_USER_INFO_PROFILE)
  );
}
