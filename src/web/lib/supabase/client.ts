"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
// createBrowserClient always forces detectSessionInUrl: true after merging
// options.auth, which breaks third-party OAuth callbacks that also use ?code=.
import { createStorageFromOptions } from "@supabase/ssr/dist/module/cookies";
import { isBrowser } from "@supabase/ssr/dist/module/utils";

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

    const { storage } = createStorageFromOptions(
      { cookieEncoding: "base64url" },
      false,
    );

    browserClient = createClient(url, key, {
      auth: {
        flowType: "pkce",
        autoRefreshToken: isBrowser(),
        detectSessionInUrl: false,
        persistSession: true,
        storage,
      },
    });
  }
  return browserClient;
}
