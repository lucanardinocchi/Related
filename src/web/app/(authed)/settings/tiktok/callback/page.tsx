"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserDeps } from "@/lib/deps/client";
import { Button } from "@/components/ui";
import { PageHeader } from "@/components/ui/PageHeader";

const TIKTOK_OAUTH_STATE_KEY = "related.tiktok-oauth-state";

export default function TikTokCallbackPage() {
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const oauthError = params.get("error");
      const state = params.get("state");

      if (oauthError) {
        setStatus("error");
        setError(oauthError);
        return;
      }
      if (!code) {
        setStatus("error");
        setError("Missing authorization code");
        return;
      }

      const expectedState = sessionStorage.getItem(TIKTOK_OAUTH_STATE_KEY);
      if (expectedState && state && state !== expectedState) {
        setStatus("error");
        setError("OAuth state mismatch — try connecting again from Settings.");
        return;
      }

      try {
        const { tiktok } = getBrowserDeps();
        const redirectUri =
          window.location.origin + "/settings/tiktok/callback";
        const result = await tiktok.exchangeOAuthCode({ code, redirectUri });
        if (result.status !== "ok") {
          setStatus("error");
          setError(result.error ?? "Could not connect TikTok");
          return;
        }
        sessionStorage.removeItem(TIKTOK_OAUTH_STATE_KEY);
        setStatus("ok");
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : "Could not connect TikTok");
      }
    }

    void run();
  }, []);

  return (
    <>
      <PageHeader title="TikTok" subtitle="Connecting your account…" />
      <div className="py-6">
        {status === "working" ? (
          <p className="text-[13px] text-fg-muted">Finishing TikTok connect…</p>
        ) : null}
        {status === "ok" ? (
          <div className="space-y-3">
            <p className="text-[13px] text-fg">
              TikTok connected. You can now view and send DMs from relationship
              and group pages.
            </p>
            <Link href="/settings">
              <Button variant="secondary" size="sm">
                Back to Settings
              </Button>
            </Link>
          </div>
        ) : null}
        {status === "error" ? (
          <div className="space-y-3">
            <p className="text-[13px] text-danger" role="alert">
              {error ?? "Could not connect TikTok"}
            </p>
            <Link href="/settings">
              <Button variant="secondary" size="sm">
                Back to Settings
              </Button>
            </Link>
          </div>
        ) : null}
      </div>
    </>
  );
}
