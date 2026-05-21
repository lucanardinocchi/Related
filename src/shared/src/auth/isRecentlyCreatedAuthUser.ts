/** True when the User account was created within `windowMs` (default 5 minutes). */
export function isRecentlyCreatedAuthUser(
  user: { created_at?: string },
  windowMs = 5 * 60 * 1000,
): boolean {
  if (!user.created_at) return false;
  return Date.now() - new Date(user.created_at).getTime() < windowMs;
}
