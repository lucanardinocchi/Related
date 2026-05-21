"use client";

import { useEffect, useState } from "react";
import { getBrowserDeps } from "@/lib/deps/client";
import { OAuthReturnLink } from "@/components/integrations/OAuthReturnLink";
import { PageHeader } from "@/components/ui/PageHeader";

const OUTLOOK_CODE_VERIFIER_KEY = "related.outlook-oauth-code-verifier";

export default function OutlookCallbackPage() {
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const oauthError = params.get("error");
      const oauthErrorDescription = params.get("error_description");

      if (oauthError) {
        setStatus("error");
        setError(oauthErrorDescription ?? oauthError);
        return;
      }
      if (!code) {
        setStatus("error");
        setError("Missing authorization code");
        return;
      }

      const codeVerifier = sessionStorage.getItem(OUTLOOK_CODE_VERIFIER_KEY);
      if (!codeVerifier) {
        setStatus("error");
        setError(
          "Missing PKCE verifier — try connecting again.",
        );
        return;
      }

      try {
        const { outlook, onboarding } = getBrowserDeps();
        const redirectUri =
          window.location.origin + "/settings/outlook/callback";
        const result = await outlook.exchangeOAuthCode({
          code,
          redirectUri,
          codeVerifier,
        });
        if (result.status !== "ok") {
          setStatus("error");
          setError(result.error ?? "Could not connect Outlook Calendar");
          return;
        }
        sessionStorage.removeItem(OUTLOOK_CODE_VERIFIER_KEY);
        sessionStorage.removeItem("related.outlook-oauth-state");
        await onboarding.completeStep("calendar");
        setStatus("ok");
      } catch (e) {
        setStatus("error");
        setError(
          e instanceof Error ? e.message : "Could not connect Outlook Calendar",
        );
      }
    }

    void run();
  }, []);

  return (
    <>
      <PageHeader title="Outlook Calendar" subtitle="Connecting your account…" />
      <div className="py-6">
        {status === "working" ? (
          <p className="text-[13px] text-fg-muted">Finishing Outlook connect…</p>
        ) : null}
        {status === "ok" ? (
          <div className="space-y-3">
            <p className="text-[13px] text-fg">
              Outlook Calendar connected. Related will read your week&apos;s
              density for catch-up timing.
            </p>
            <OAuthReturnLink />
          </div>
        ) : null}
        {status === "error" ? (
          <div className="space-y-3">
            <p className="text-[13px] text-danger" role="alert">
              {error ?? "Could not connect Outlook Calendar"}
            </p>
            <OAuthReturnLink />
          </div>
        ) : null}
      </div>
    </>
  );
}
