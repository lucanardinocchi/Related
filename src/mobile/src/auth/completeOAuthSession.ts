import * as WebBrowser from "expo-web-browser";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { makeRedirectUri } from "expo-auth-session";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isRecentlyCreatedAuthUser,
  type OnboardingClient,
} from "@related/shared";

WebBrowser.maybeCompleteAuthSession();

/** Redirect URI allow-listed in Supabase for native OAuth sign-in. */
export function authOAuthRedirectUri(): string {
  return makeRedirectUri({ scheme: "related", path: "auth-callback" });
}

/**
 * Opens the provider OAuth URL in a browser session and exchanges the
 * returned code for a Supabase session.
 */
export async function completeOAuthFromBrowser(
  supabase: SupabaseClient,
  authUrl: string,
): Promise<void> {
  const redirectTo = authOAuthRedirectUri();
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);

  if (result.type === "cancel" || result.type === "dismiss") {
    throw new Error("OAuth sign-in was cancelled");
  }
  if (result.type !== "success") {
    throw new Error("OAuth sign-in did not complete");
  }

  const { params, errorCode } = QueryParams.getQueryParams(result.url);
  if (errorCode) {
    throw new Error(`OAuth error: ${errorCode}`);
  }

  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    return;
  }

  if (params.access_token && params.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) throw error;
    return;
  }

  throw new Error("OAuth callback did not include session credentials");
}

export async function ensureOnboardingForNewOAuthUser(
  supabase: SupabaseClient,
  onboardingClient: OnboardingClient,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isRecentlyCreatedAuthUser(user)) return;
  await onboardingClient.startIfNeeded();
}
