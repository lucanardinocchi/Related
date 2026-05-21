"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserDeps } from "@/lib/deps/client";
import { Button } from "@/components/ui";
import { PageHeader } from "@/components/ui/PageHeader";

const X_CODE_VERIFIER_KEY = "related.x-oauth-code-verifier";

export default function XCallbackPage() {
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const oauthError = params.get("error");

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

      const codeVerifier = sessionStorage.getItem(X_CODE_VERIFIER_KEY);
      if (!codeVerifier) {
        setStatus("error");
        setError("Missing PKCE verifier — try connecting again from Settings.");
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
          setStatus("error");
          setError(result.error ?? "Could not connect X");
          return;
        }
        sessionStorage.removeItem(X_CODE_VERIFIER_KEY);
        sessionStorage.removeItem("related.x-oauth-state");
        setStatus("ok");
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : "Could not connect X");
      }
    }

    void run();
  }, []);

  return (
    <>
      <PageHeader title="X" subtitle="Connecting your account…" />
      <div className="py-6">
        {status === "working" ? (
          <p className="text-[13px] text-fg-muted">Finishing X connect…</p>
        ) : null}
        {status === "ok" ? (
          <div className="space-y-3">
            <p className="text-[13px] text-fg">
              X connected. You can now view and send DMs from relationship and
              group pages.
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
              {error ?? "Could not connect X"}
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
