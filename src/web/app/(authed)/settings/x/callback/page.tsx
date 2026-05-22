"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getBrowserDeps } from "@/lib/deps/client";
import { redirectToSettings } from "@/lib/integrations/oauthReturn";

const X_CODE_VERIFIER_KEY = "related.x-oauth-code-verifier";

export default function XCallbackPage() {
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

      const codeVerifier = sessionStorage.getItem(X_CODE_VERIFIER_KEY);
      if (!codeVerifier) {
        redirectToSettings(
          router,
          "Missing PKCE verifier — try connecting again from Settings.",
        );
        return;
      }

      try {
        const { x } = getBrowserDeps();
        const redirectUri = window.location.origin + "/settings/x/callback";
        const result = await x.exchangeOAuthCode({
          code,
          redirectUri,
          codeVerifier,
        });
        if (result.status !== "ok") {
          redirectToSettings(router, result.error ?? "Could not connect X");
          return;
        }
        sessionStorage.removeItem(X_CODE_VERIFIER_KEY);
        sessionStorage.removeItem("related.x-oauth-state");
        redirectToSettings(router);
      } catch (e) {
        redirectToSettings(
          router,
          e instanceof Error ? e.message : "Could not connect X",
        );
      }
    }

    void run();
  }, [router]);

  return null;
}
