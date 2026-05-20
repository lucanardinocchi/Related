"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getBrowserDeps } from "@/lib/deps/client";

interface OnboardingFlowProps {
  initialCalendarConnected: boolean;
}

/**
 * Web onboarding — narrow surface: just Connect Google Calendar.
 *
 * OAuth handshake:
 *  1. Click → `supabase.auth.signInWithOAuth({ provider: "google", … })`
 *     redirects to Google. The User leaves the SPA entirely.
 *  2. Google bounces back to `redirectTo` (this same page) with `?code=…`.
 *     Supabase's `detectSessionInUrl` swaps the code for a session that
 *     carries `provider_token` + `provider_refresh_token` — but only for
 *     this one initial read.
 *  3. We listen via `onAuthStateChange` for the `SIGNED_IN` event that
 *     fires once the session is hydrated; at that point we read
 *     `getSessionWithProviderTokens()`, persist via
 *     `userProviderTokens.upsert(...)`, then `onboarding.completeStep("calendar")`.
 *
 * Edge case: if the page mounts and the URL already contains `?code=…`
 * (the most common return path), Supabase processes it before our listener
 * attaches. We belt-and-braces this by also probing
 * `getSessionWithProviderTokens()` once on mount — if a `providerToken` is
 * present, capture it.
 */
export function OnboardingFlow({
  initialCalendarConnected,
}: OnboardingFlowProps) {
  const [calendarConnected, setCalendarConnected] = useState(
    initialCalendarConnected,
  );
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards the capture-and-persist effect from running twice across the
  // initial probe + the auth-state-change listener firing back-to-back.
  const captureRunning = useRef(false);

  const captureProviderTokens = useCallback(async () => {
    if (captureRunning.current) return;
    captureRunning.current = true;
    try {
      const { auth, userProviderTokens, onboarding } = getBrowserDeps();
      const session = await auth.getSessionWithProviderTokens();
      if (!session?.providerToken) return;
      await userProviderTokens.upsert({
        provider: "google",
        accessToken: session.providerToken,
        refreshToken: session.providerRefreshToken,
        scopes: "https://www.googleapis.com/auth/calendar.readonly",
        expiresAt:
          session.expiresAt !== null
            ? new Date(session.expiresAt * 1000).toISOString()
            : null,
      });
      const next = await onboarding.completeStep("calendar");
      setCalendarConnected(next.completedSteps.includes("calendar"));
      setWorking(false);
      // Clean the ?code= / fragment Supabase appended so a reload doesn't
      // re-run capture against a stale URL. (Supabase has already swapped
      // the code by this point.)
      if (typeof window !== "undefined") {
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, "", cleanUrl);
      }
    } catch (e) {
      // Capture is best-effort. Surface a tiny error so the User can retry
      // by clicking Connect again.
      setError(
        e instanceof Error ? e.message : "Failed to save calendar connection",
      );
    } finally {
      captureRunning.current = false;
    }
  }, []);

  // On mount: (a) probe the current session for provider tokens (handles
  // the case where Supabase swallowed the OAuth `?code=` before our
  // listener attached), and (b) subscribe to onAuthStateChange so we
  // catch the SIGNED_IN event if it lands after mount.
  useEffect(() => {
    if (calendarConnected) return;

    captureProviderTokens();

    const { auth } = getBrowserDeps();
    const unsubscribe = auth.onAuthStateChange(() => {
      // The session shape we want (`SessionWithProviderTokens`) isn't
      // exposed via this callback — we just use the event as a signal
      // to re-probe.
      captureProviderTokens();
    });
    return () => {
      unsubscribe();
    };
  }, [calendarConnected, captureProviderTokens]);

  async function connectCalendar() {
    if (working) return;
    setError(null);
    setWorking(true);
    try {
      const { supabase } = getBrowserDeps();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes: "https://www.googleapis.com/auth/calendar.readonly",
          redirectTo: window.location.origin + "/onboarding",
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (oauthError) throw oauthError;
      // Browser is being redirected to Google. Leave `working` true so the
      // button stays disabled until the navigation actually happens.
    } catch (e) {
      setWorking(false);
      setError(e instanceof Error ? e.message : "Failed to start OAuth");
    }
  }

  return (
    <>
      <PageHeader
        title="Connect your calendar"
        subtitle="Related reads your week's density to gauge when you have capacity for catch-ups. Read-only — it never writes events."
      />

      <Card>
        {calendarConnected ? (
          <div className="space-y-4">
            <p className="text-sm font-medium text-fg">
              <span aria-hidden="true">✓ </span>
              Calendar connected
            </p>
            <p className="text-sm text-muted">
              Related will pull your week ahead on the next sync.
            </p>
            <Link
              href="/context"
              className="inline-flex items-center justify-center rounded-md bg-fg px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:opacity-90"
            >
              Continue to Context
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Sign in with Google and grant the calendar.readonly scope.
              You&rsquo;ll leave the app briefly for Google&rsquo;s consent
              screen, then return here.
            </p>
            <Button
              variant="primary"
              onClick={connectCalendar}
              loading={working}
              disabled={working}
            >
              Connect Google Calendar
            </Button>
            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </Card>
    </>
  );
}
