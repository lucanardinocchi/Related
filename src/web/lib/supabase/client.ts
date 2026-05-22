"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function createBrowserSupabase(): SupabaseClient {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in the browser bundle.",
      );
    }
    // Supabase sign-in OAuth is exchanged server-side at /auth/callback.
    // Integration OAuth (Outlook, X, …) also returns ?code= on other routes;
    // auto-detect would treat those as Supabase PKCE callbacks and fail.
    browserClient = createBrowserClient(url, key, {
      auth: { detectSessionInUrl: false },
    });
  }
  return browserClient;
}
