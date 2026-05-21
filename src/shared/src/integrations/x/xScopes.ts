/**
 * X API OAuth 2.0 scopes for Direct Messages.
 * Stored verbatim on user_provider_tokens.scopes after connect.
 */

export const X_SCOPE_DM_READ = "dm.read";
export const X_SCOPE_DM_WRITE = "dm.write";
export const X_SCOPE_USERS_READ = "users.read";
export const X_SCOPE_TWEET_READ = "tweet.read";
export const X_SCOPE_OFFLINE_ACCESS = "offline.access";

export const X_INTEGRATION_SCOPES = [
  X_SCOPE_DM_READ,
  X_SCOPE_DM_WRITE,
  X_SCOPE_USERS_READ,
  X_SCOPE_TWEET_READ,
  X_SCOPE_OFFLINE_ACCESS,
].join(" ");

export function tokenHasXAccess(scopes: string | null | undefined): boolean {
  if (!scopes) return false;
  return scopes.includes(X_SCOPE_DM_READ) && scopes.includes(X_SCOPE_DM_WRITE);
}
