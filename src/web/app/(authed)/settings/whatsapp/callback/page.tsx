"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getBrowserDeps } from "@/lib/deps/client";
import { redirectToSettings } from "@/lib/integrations/oauthReturn";

export default function WhatsAppCallbackPage() {
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
        const { whatsapp } = getBrowserDeps();
        const redirectUri =
          window.location.origin + "/settings/whatsapp/callback";
        const result = await whatsapp.exchangeOAuthCode({ code, redirectUri });
        if (result.status !== "ok") {
          redirectToSettings(router, result.error ?? "Could not connect WhatsApp");
          return;
        }
        sessionStorage.removeItem("related.whatsapp-oauth-state");
        redirectToSettings(router);
      } catch (e) {
        redirectToSettings(
          router,
          e instanceof Error ? e.message : "Could not connect WhatsApp",
        );
      }
    }

    void run();
  }, [router]);

  return null;
}
