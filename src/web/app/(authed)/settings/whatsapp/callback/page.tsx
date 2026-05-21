"use client";

import { useEffect, useState } from "react";
import { getBrowserDeps } from "@/lib/deps/client";
import { OAuthReturnLink } from "@/components/integrations/OAuthReturnLink";
import { PageHeader } from "@/components/ui/PageHeader";

export default function WhatsAppCallbackPage() {
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
        const { whatsapp } = getBrowserDeps();
        const redirectUri =
          window.location.origin + "/settings/whatsapp/callback";
        const result = await whatsapp.exchangeOAuthCode({ code, redirectUri });
        if (result.status !== "ok") {
          setStatus("error");
          setError(result.error ?? "Could not connect WhatsApp");
          return;
        }
        sessionStorage.removeItem("related.whatsapp-oauth-state");
        setStatus("ok");
      } catch (e) {
        setStatus("error");
        setError(
          e instanceof Error ? e.message : "Could not connect WhatsApp",
        );
      }
    }

    void run();
  }, []);

  return (
    <>
      <PageHeader title="WhatsApp" subtitle="Connecting your account…" />
      <div className="py-6">
        {status === "working" ? (
          <p className="text-[13px] text-fg-muted">
            Finishing WhatsApp connect…
          </p>
        ) : null}
        {status === "ok" ? (
          <div className="space-y-3">
            <p className="text-[13px] text-fg">
              WhatsApp connected. You can now view and send DMs from
              relationship and group pages. Configure the Meta webhook to sync
              inbound messages.
            </p>
            <OAuthReturnLink />
          </div>
        ) : null}
        {status === "error" ? (
          <div className="space-y-3">
            <p className="text-[13px] text-danger" role="alert">
              {error ?? "Could not connect WhatsApp"}
            </p>
            <OAuthReturnLink />
          </div>
        ) : null}
      </div>
    </>
  );
}
