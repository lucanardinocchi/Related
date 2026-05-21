import { isRecentlyCreatedAuthUser } from "@related/shared";
import { NextResponse } from "next/server";
import { getServerDeps } from "@/lib/deps/server";

export const dynamic = "force-dynamic";

/**
 * Exchanges a Supabase auth code (recovery, email confirm, OAuth) for a
 * session and redirects to `next` (default `/`).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(
      new URL("/sign-in?error=auth_callback_missing_code", origin),
    );
  }

  const { supabase, onboarding } = await getServerDeps();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL("/sign-in?error=auth_callback_failed", origin),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && isRecentlyCreatedAuthUser(user)) {
    await onboarding.startIfNeeded();
  }

  let redirectPath = next.startsWith("/") ? next : `/${next}`;
  if (user && isRecentlyCreatedAuthUser(user)) {
    redirectPath = "/onboarding";
  }

  return NextResponse.redirect(new URL(redirectPath, origin));
}
