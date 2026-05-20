import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

function readEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Set both in src/web/.env.local (and in Vercel for prod).",
    );
  }
  return { url, key };
}

export async function createServerSupabase() {
  const { url, key } = readEnv();
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // setAll is called from a Server Component — Next disallows
          // mutating cookies there, but middleware refreshes the session
          // on every request so this branch is safe to swallow.
        }
      },
    },
  });
}
