"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserDeps } from "@/lib/deps/client";
import { OAuthReturnLink } from "@/components/integrations/OAuthReturnLink";
import { PageHeader } from "@/components/ui/PageHeader";

const OUTLOOK_CODE_VERIFIER_KEY = "related.outlook-oauth-code-verifier";
const OUTLOOK_OAUTH_STATE_KEY = "related.outlook-oauth-state";

type Status = "working" | "syncing" | "ok" | "ok-sync-failed" | "error";

export default function OutlookCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const stateParam = params.get("state");
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

      // CSRF defence: the random `state` we stashed before redirecting must
      // round-trip exactly. A missing/mismatched value means this callback
      // was not initiated by us, so refuse to exchange the code.
      const expectedState = sessionStorage.getItem(OUTLOOK_OAUTH_STATE_KEY);
      if (!expectedState || !stateParam || expectedState !== stateParam) {
        setStatus("error");
        setError(
          "OAuth state mismatch — try connecting again from Settings.",
        );
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
        const { outlook, onboarding, supabase } = getBrowserDeps();
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
        sessionStorage.removeItem(OUTLOOK_OAUTH_STATE_KEY);
        await onboarding.completeStep("calendar");

        // Trigger an immediate sync so the user sees events without waiting
        // for the daily pg_cron run. Failures here are non-fatal — the next
        // scheduled run will retry.
        setStatus("syncing");
        const { data: userData } = await supabase.auth.getUser();
        const ownerId = userData.user?.id;
        let syncOk = true;
        if (ownerId) {
          const { error: syncError } = await supabase.functions.invoke(
            "sync-calendar",
            { body: { ownerId } },
          );
          if (syncError) syncOk = false;
        } else {
          syncOk = false;
        }

        setStatus(syncOk ? "ok" : "ok-sync-failed");
        setTimeout(() => router.push("/calendar"), syncOk ? 600 : 1800);
      } catch (e) {
        setStatus("error");
        setError(
          e instanceof Error ? e.message : "Could not connect Outlook Calendar",
        );
      }
    }

    void run();
  }, [router]);

  return (
    <>
      <PageHeader title="Outlook Calendar" subtitle="Connecting your account…" />
      <div className="py-6">
        {status === "working" ? (
          <p className="text-[13px] text-fg-muted">Finishing Outlook connect…</p>
        ) : null}
        {status === "syncing" ? (
          <p className="text-[13px] text-fg-muted">Syncing your calendar…</p>
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
        {status === "ok-sync-failed" ? (
          <div className="space-y-3">
            <p className="text-[13px] text-warning" role="status">
              Connected, but the initial calendar sync failed. Related will
              retry automatically on the next scheduled run.
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
