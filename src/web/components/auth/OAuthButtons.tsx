"use client";

import { useState } from "react";
import type { OAuthSignInProvider } from "@related/shared";
import { Button } from "@/components/ui/Button";
import { buildAuthOAuthRedirectTo } from "@/lib/auth/oauthRedirect";
import { getBrowserDeps } from "@/lib/deps/client";

interface OAuthButtonsProps {
  /** Post-auth path passed through `/auth/callback` (default `/relationships`). */
  nextPath?: string;
}

export function OAuthButtons({ nextPath = "/relationships" }: OAuthButtonsProps) {
  const [error, setError] = useState<string | null>(null);
  const [loadingProvider, setLoadingProvider] =
    useState<OAuthSignInProvider | null>(null);

  async function startOAuth(provider: OAuthSignInProvider) {
    setError(null);
    setLoadingProvider(provider);
    try {
      const { url } = await getBrowserDeps().auth.signInWithOAuth(
        provider,
        buildAuthOAuthRedirectTo(nextPath),
      );
      window.location.href = url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "OAuth sign-in failed");
      setLoadingProvider(null);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        loading={loadingProvider === "google"}
        disabled={loadingProvider !== null}
        onClick={() => void startOAuth("google")}
      >
        Continue with Google
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        loading={loadingProvider === "apple"}
        disabled={loadingProvider !== null}
        onClick={() => void startOAuth("apple")}
      >
        Continue with Apple
      </Button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

export function AuthDivider() {
  return (
    <div className="relative py-2">
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <div className="w-full border-t border-border" />
      </div>
      <p className="relative mx-auto w-fit bg-surface px-3 text-xs text-muted">
        or continue with email
      </p>
    </div>
  );
}
