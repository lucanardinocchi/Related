import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/auth"];

/** OAuth callbacks and onboarding must stay reachable while setup is incomplete. */
function isOnboardingExempt(path: string): boolean {
  if (path === "/onboarding" || path.startsWith("/onboarding/")) return true;
  if (path.startsWith("/settings/") && path.endsWith("/callback")) return true;
  return false;
}

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in middleware env.",
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && (path === "/sign-in" || path === "/sign-up")) {
    const url = request.nextUrl.clone();
    url.pathname = await resolvePostAuthPath(supabase);
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  if (user && !isPublic && !isOnboardingExempt(path)) {
    const needsOnboarding = await userNeedsOnboarding(supabase);
    if (needsOnboarding) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

async function userNeedsOnboarding(
  supabase: ReturnType<typeof createServerClient>,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("onboarding_state")
    .select("finished_at")
    .maybeSingle();
  if (error) return false;
  if (!data) return false;
  return data.finished_at === null;
}

async function resolvePostAuthPath(
  supabase: ReturnType<typeof createServerClient>,
): Promise<string> {
  const needsOnboarding = await userNeedsOnboarding(supabase);
  return needsOnboarding ? "/onboarding" : "/relationships";
}
