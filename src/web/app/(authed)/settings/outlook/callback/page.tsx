"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getBrowserDeps } from "@/lib/deps/client";
import { ensureOAuthCallbackSession } from "@/lib/integrations/ensureOAuthCallbackSession";
import { redirectToSettings } from "@/lib/integrations/oauthReturn";

const OUTLOOK_CODE_VERIFIER_KEY = "related.outlook-oauth-code-verifier";
const OUTLOOK_OAUTH_STATE_KEY = "related.outlook-oauth-state";

export default function OutlookCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    async function run() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const stateParam = params.get("state");
      const oauthError = params.get("error");
      const oauthErrorDescription = params.get("error_description");

      if (oauthError) {
        redirectToSettings(router, oauthErrorDescription ?? oauthError);
        return;
      }
      if (!code) {
        redirectToSettings(router, "Missing authorization code");
        return;
      }

      const expectedState = sessionStorage.getItem(OUTLOOK_OAUTH_STATE_KEY);
      if (!expectedState || !stateParam || expectedState !== stateParam) {
        redirectToSettings(
          router,
          "OAuth state mismatch — try connecting again from Settings.",
        );
        return;
      }

      const codeVerifier = sessionStorage.getItem(OUTLOOK_CODE_VERIFIER_KEY);
      if (!codeVerifier) {
        redirectToSettings(
          router,
          "Missing PKCE verifier — try connecting again.",
        );
        return;
      }

      try {
        const { outlook, onboarding, supabase } = getBrowserDeps();
        await ensureOAuthCallbackSession(supabase);
        const redirectUri =
          window.location.origin + "/settings/outlook/callback";
        const result = await outlook.exchangeOAuthCode({
          code,
          redirectUri,
          codeVerifier,
        });
        if (result.status !== "ok") {
          redirectToSettings(
            router,
            result.error ?? "Could not connect Outlook",
          );
          return;
        }
        sessionStorage.removeItem(OUTLOOK_CODE_VERIFIER_KEY);
        sessionStorage.removeItem(OUTLOOK_OAUTH_STATE_KEY);
        await onboarding.completeStep("calendar");

        const { data: userData } = await supabase.auth.getUser();
        const ownerId = userData.user?.id;
        if (ownerId) {
          void supabase.functions.invoke("sync-calendar", {
            body: { ownerId },
          });
        }

        redirectToSettings(router);
      } catch (e) {
        redirectToSettings(
          router,
          e instanceof Error ? e.message : "Could not connect Outlook",
        );
      }
    }

    void run();
  }, [router]);

  return null;
}
