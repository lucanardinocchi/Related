"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getBrowserDeps } from "@/lib/deps/client";
import { redirectToSettings } from "@/lib/integrations/oauthReturn";

const TIKTOK_OAUTH_STATE_KEY = "related.tiktok-oauth-state";

export default function TikTokCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    async function run() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const oauthError = params.get("error");
      const state = params.get("state");

      if (oauthError) {
        redirectToSettings(router, oauthError);
        return;
      }
      if (!code) {
        redirectToSettings(router, "Missing authorization code");
        return;
      }

      const expectedState = sessionStorage.getItem(TIKTOK_OAUTH_STATE_KEY);
      if (expectedState && state && state !== expectedState) {
        redirectToSettings(
          router,
          "OAuth state mismatch — try connecting again from Settings.",
        );
        return;
      }

      try {
        const { tiktok } = getBrowserDeps();
        const redirectUri =
          window.location.origin + "/settings/tiktok/callback";
        const result = await tiktok.exchangeOAuthCode({ code, redirectUri });
        if (result.status !== "ok") {
          redirectToSettings(router, result.error ?? "Could not connect TikTok");
          return;
        }
        sessionStorage.removeItem(TIKTOK_OAUTH_STATE_KEY);
        redirectToSettings(router);
      } catch (e) {
        redirectToSettings(
          router,
          e instanceof Error ? e.message : "Could not connect TikTok",
        );
      }
    }

    void run();
  }, [router]);

  return null;
}
