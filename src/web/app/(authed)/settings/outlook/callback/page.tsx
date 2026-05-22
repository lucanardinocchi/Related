"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  OUTLOOK_CODE_VERIFIER_KEY,
  OUTLOOK_OAUTH_STATE_KEY,
} from "@/lib/integrations/integrationConnect";
import {
  clearIntegrationOAuthValue,
  getIntegrationOAuthValue,
} from "@/lib/integrations/integrationOAuthStorage";
import { ensureOAuthCallbackSession } from "@/lib/integrations/ensureOAuthCallbackSession";
import { buildOutlookCallbackRedirectUri } from "@/lib/integrations/integrationOAuthOrigin";
import { redirectToSettings } from "@/lib/integrations/oauthReturn";
import { triggerCalendarConnectSync } from "@/lib/integrations/calendarConnectSync";
import { getBrowserDeps } from "@/lib/deps/client";

export default function OutlookCallbackPage() {
  const router = useRouter();
  const started = useRef(false);
  const [status, setStatus] = useState("Connecting Outlook…");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function run() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const stateParam = params.get("state");
      const oauthError = params.get("error");
      const oauthErrorDescription = params.get("error_description");

      if (oauthError) {
        const message =
          oauthError === "server_error" || oauthError === "temporarily_unavailable"
            ? "Microsoft sign-in had a temporary issue. Try connecting again."
            : (oauthErrorDescription ?? oauthError);
        redirectToSettings(router, message, { hard: true });
        return;
      }
      if (!code) {
        redirectToSettings(router, "Missing authorization code", { hard: true });
        return;
      }

      const expectedState = getIntegrationOAuthValue(OUTLOOK_OAUTH_STATE_KEY);
      if (!expectedState || !stateParam || expectedState !== stateParam) {
        redirectToSettings(
          router,
          "OAuth state mismatch — try connecting again from Settings.",
          { hard: true },
        );
        return;
      }

      const codeVerifier = getIntegrationOAuthValue(OUTLOOK_CODE_VERIFIER_KEY);
      if (!codeVerifier) {
        redirectToSettings(
          router,
          "Missing PKCE verifier — try connecting again.",
          { hard: true },
        );
        return;
      }

      const redirectUri = buildOutlookCallbackRedirectUri();

      try {
        setStatus("Finishing Outlook sign-in…");
        const { outlook, onboarding, supabase } = getBrowserDeps();
        await ensureOAuthCallbackSession(supabase);
        const result = await outlook.exchangeOAuthCode({
          code,
          redirectUri,
          codeVerifier,
        });
        if (result.status !== "ok") {
          redirectToSettings(
            router,
            result.error ?? "Could not connect Outlook",
            { hard: true },
          );
          return;
        }
        clearIntegrationOAuthValue(OUTLOOK_CODE_VERIFIER_KEY);
        clearIntegrationOAuthValue(OUTLOOK_OAUTH_STATE_KEY);
        window.history.replaceState({}, "", window.location.pathname);
        await onboarding.completeStep("calendar");

        const { data: userData } = await supabase.auth.getUser();
        const ownerId = userData.user?.id;
        if (ownerId) {
          triggerCalendarConnectSync(supabase, ownerId);
        }

        setStatus("Outlook connected. Returning to Settings…");
        redirectToSettings(router, null, {
          success: "outlook",
          hard: true,
        });
      } catch (e) {
        redirectToSettings(
          router,
          e instanceof Error ? e.message : "Could not connect Outlook",
          { hard: true },
        );
      }
    }

    void run();
  }, [router]);

  return (
    <p className="px-6 py-10 text-[14px] text-fg-muted" role="status">
      {status}
    </p>
  );
}
