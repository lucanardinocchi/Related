"use client";

import { useState } from "react";
import type { OAuthSignInProvider } from "@related/shared";
import { ProviderSignInButton } from "@/components/auth/ProviderSignInButton";
import { Button, Modal } from "@/components/ui";
import { buildAuthOAuthRedirectTo } from "@/lib/auth/oauthRedirect";
import { getBrowserDeps } from "@/lib/deps/client";

interface OAuthButtonsProps {
  /** Post-auth path passed through `/auth/callback` (default `/relationships`). */
  nextPath?: string;
  /** Affects button copy ("Sign in with …" vs "Sign up with …"). */
  action?: "sign-in" | "sign-up";
}

export function OAuthButtons({
  nextPath = "/relationships",
  action = "sign-in",
}: OAuthButtonsProps) {
  const [error, setError] = useState<string | null>(null);
  const [loadingProvider, setLoadingProvider] =
    useState<OAuthSignInProvider | null>(null);
  const [appleComingSoonOpen, setAppleComingSoonOpen] = useState(false);

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
      <ProviderSignInButton
        provider="google"
        action={action}
        loading={loadingProvider === "google"}
        disabled={loadingProvider !== null}
        onClick={() => void startOAuth("google")}
      />
      <ProviderSignInButton
        provider="apple"
        action={action}
        disabled={loadingProvider !== null}
        onClick={() => setAppleComingSoonOpen(true)}
      />
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Modal
        open={appleComingSoonOpen}
        onClose={() => setAppleComingSoonOpen(false)}
        title={action === "sign-up" ? "Sign up with Apple" : "Sign in with Apple"}
        subtitle="Coming soon"
        size="sm"
        footer={
          <Button type="button" onClick={() => setAppleComingSoonOpen(false)}>
            OK
          </Button>
        }
      >
        <p className="text-[14px] leading-[22px] text-fg-subtle">
          {action === "sign-up" ? "Sign up" : "Sign in"} with Apple isn&apos;t
          available yet. Use Google or email to
          {action === "sign-up" ? " create your account" : " sign in"} for now.
        </p>
      </Modal>
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
