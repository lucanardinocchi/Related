import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * OAuth provider redirects can take long enough for the Supabase JWT to expire.
 * Refresh before invoking Edge Functions so the gateway accepts the request.
 */
export async function ensureOAuthCallbackSession(
  supabase: SupabaseClient,
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error(
      "Your sign-in session expired. Sign in again, then reconnect from Settings.",
    );
  }

  const expiresAtMs = (session.expires_at ?? 0) * 1000;
  if (expiresAtMs < Date.now() + 60_000) {
    const { error } = await supabase.auth.refreshSession();
    if (error) {
      throw new Error(
        "Your sign-in session expired. Sign in again, then reconnect from Settings.",
      );
    }
  }
}
