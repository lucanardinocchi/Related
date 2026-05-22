import {
  isRecentlyCreatedAuthUser,
  mergeGoogleScopesOnConnect,
  tokenHasCalendarAccess,
  type GoogleConnectIntent,
} from "@related/shared";
import type { Session } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getServerDeps } from "@/lib/deps/server";

export const dynamic = "force-dynamic";

type SessionWithProviderTokens = Session & {
  provider_token?: string | null;
  provider_refresh_token?: string | null;
};

function normalizeGoogleIntent(raw: string | null): GoogleConnectIntent | null {
  if (raw === "gmail" || raw === "calendar") return raw;
  return null;
}

/**
 * Exchanges a Supabase auth code (recovery, email confirm, OAuth) for a
 * session and redirects to `next` (default `/`).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const googleIntent = normalizeGoogleIntent(url.searchParams.get("google_intent"));
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(
      new URL("/sign-in?error=auth_callback_missing_code", origin),
    );
  }

  const { supabase, onboarding, userProviderTokens } = await getServerDeps();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const failPath = googleIntent
      ? `${next.startsWith("/") ? next : `/${next}`}?oauth_error=${encodeURIComponent(error.message)}`
      : "/sign-in?error=auth_callback_failed";
    return NextResponse.redirect(new URL(failPath, origin));
  }

  const session = data.session as SessionWithProviderTokens | null;
  if (session?.provider_token && googleIntent) {
    const existing = await userProviderTokens.getForProvider("google");
    const scopes = mergeGoogleScopesOnConnect(existing?.scopes, googleIntent);
    await userProviderTokens.upsert({
      provider: "google",
      accessToken: session.provider_token,
      refreshToken:
        session.provider_refresh_token ?? existing?.refreshToken ?? null,
      scopes,
      expiresAt:
        session.expires_at != null
          ? new Date(session.expires_at * 1000).toISOString()
          : null,
    });
    if (tokenHasCalendarAccess(scopes)) {
      await onboarding.completeStep("calendar");
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && isRecentlyCreatedAuthUser(user)) {
    await onboarding.startIfNeeded();
  }

  let redirectPath = next.startsWith("/") ? next : `/${next}`;
  if (user && isRecentlyCreatedAuthUser(user) && !googleIntent) {
    redirectPath = "/onboarding";
  }

  return NextResponse.redirect(new URL(redirectPath, origin));
}
