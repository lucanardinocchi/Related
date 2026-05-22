"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import {
  buildOAuthReturnPath,
  captureGoogleProviderTokens,
} from "@/lib/integrations/integrationConnect";
import { isIntegrationOAuthCallbackPath } from "@/lib/integrations/integrationOAuthStorage";

/**
 * Persists Google provider tokens after OAuth on any authed route (not only
 * Settings / Onboarding). Refreshes the server layout when Gmail state changes.
 */
function GoogleOAuthCaptureInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const captureRunning = useRef(false);

  const search = searchParams.toString();

  useEffect(() => {
    if (captureRunning.current) return;
    if (isIntegrationOAuthCallbackPath(pathname)) return;
    captureRunning.current = true;
    const returnPath = buildOAuthReturnPath(
      pathname,
      search ? `?${search}` : "",
    );
    void captureGoogleProviderTokens(returnPath)
      .then((result) => {
        if (result) router.refresh();
      })
      .finally(() => {
        captureRunning.current = false;
      });
  }, [pathname, search, router]);

  return null;
}

export function GoogleOAuthCapture() {
  return (
    <Suspense fallback={null}>
      <GoogleOAuthCaptureInner />
    </Suspense>
  );
}
