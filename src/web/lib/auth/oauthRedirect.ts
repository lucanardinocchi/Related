/** Supabase OAuth callback on the Next.js app. */
export function buildAuthOAuthRedirectTo(nextPath = "/relationships"): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}
