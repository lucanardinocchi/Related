"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserDeps } from "@/lib/deps/client";
import { Button } from "@/components/ui";
import { PageHeader } from "@/components/ui/PageHeader";

export default function InstagramCallbackPage() {
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

      try {
        const { instagram } = getBrowserDeps();
        const redirectUri =
          window.location.origin + "/settings/instagram/callback";
        const result = await instagram.exchangeOAuthCode({ code, redirectUri });
        if (result.status !== "ok") {
          setStatus("error");
          setError(result.error ?? "Could not connect Instagram");
          return;
        }
        sessionStorage.removeItem("related.instagram-oauth-state");
        setStatus("ok");
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : "Could not connect Instagram");
      }
    }

    void run();
  }, []);

  return (
    <>
      <PageHeader title="Instagram" subtitle="Connecting your account…" />
      <div className="py-6">
        {status === "working" ? (
          <p className="text-[13px] text-fg-muted">Finishing Instagram connect…</p>
        ) : null}
        {status === "ok" ? (
          <div className="space-y-3">
            <p className="text-[13px] text-fg">
              Instagram connected. You can now view and send DMs from relationship
              pages.
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
              {error ?? "Could not connect Instagram"}
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
