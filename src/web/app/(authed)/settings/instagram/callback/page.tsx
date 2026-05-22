"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getBrowserDeps } from "@/lib/deps/client";
import { redirectToSettings } from "@/lib/integrations/oauthReturn";

export default function InstagramCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    async function run() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const oauthError = params.get("error");

      if (oauthError) {
        redirectToSettings(router, oauthError);
        return;
      }
      if (!code) {
        redirectToSettings(router, "Missing authorization code");
        return;
      }

      try {
        const { instagram } = getBrowserDeps();
        const redirectUri =
          window.location.origin + "/settings/instagram/callback";
        const result = await instagram.exchangeOAuthCode({ code, redirectUri });
        if (result.status !== "ok") {
          redirectToSettings(router, result.error ?? "Could not connect Instagram");
          return;
        }
        sessionStorage.removeItem("related.instagram-oauth-state");
        redirectToSettings(router);
      } catch (e) {
        redirectToSettings(
          router,
          e instanceof Error ? e.message : "Could not connect Instagram",
        );
      }
    }

    void run();
  }, [router]);

  return null;
}
