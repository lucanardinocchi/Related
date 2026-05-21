"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Calendar, Mail } from "lucide-react";
import {
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_INTEGRATION_SCOPES,
  tokenHasCalendarAccess,
  tokenHasGmailAccess,
} from "@related/shared";
import { Button, Card, Section } from "@/components/ui";
import { getBrowserDeps } from "@/lib/deps/client";

const OAUTH_INTENT_KEY = "related.google-oauth-intent";

interface Props {
  initialCalendarConnected: boolean;
  initialGmailConnected: boolean;
}

export function IntegrationsSection({
  initialCalendarConnected,
  initialGmailConnected,
}: Props) {
  const [calendarConnected, setCalendarConnected] = useState(
    initialCalendarConnected,
  );
  const [gmailConnected, setGmailConnected] = useState(initialGmailConnected);
  const [working, setWorking] = useState<"calendar" | "gmail" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const captureRunning = useRef(false);

  const captureProviderTokens = useCallback(async () => {
    if (captureRunning.current) return;
    captureRunning.current = true;
    try {
      const { auth, userProviderTokens, onboarding } = getBrowserDeps();
      const session = await auth.getSessionWithProviderTokens();
      if (!session?.providerToken) return;

      const intent =
        typeof window !== "undefined"
          ? sessionStorage.getItem(OAUTH_INTENT_KEY)
          : null;
      const scopes =
        intent === "gmail"
          ? GOOGLE_INTEGRATION_SCOPES
          : GOOGLE_CALENDAR_SCOPES;

      await userProviderTokens.upsert({
        provider: "google",
        accessToken: session.providerToken,
        refreshToken: session.providerRefreshToken,
        scopes,
        expiresAt:
          session.expiresAt !== null
            ? new Date(session.expiresAt * 1000).toISOString()
            : null,
      });

      if (typeof window !== "undefined") {
        sessionStorage.removeItem(OAUTH_INTENT_KEY);
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, "", cleanUrl);
      }

      const token = await userProviderTokens.getForProvider("google");
      const hasCalendar = tokenHasCalendarAccess(token?.scopes);
      const hasGmail = tokenHasGmailAccess(token?.scopes);
      setCalendarConnected(hasCalendar);
      setGmailConnected(hasGmail);

      if (hasCalendar) {
        await onboarding.completeStep("calendar");
      }

      setWorking(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to save Google connection",
      );
      setWorking(null);
    } finally {
      captureRunning.current = false;
    }
  }, []);

  useEffect(() => {
    captureProviderTokens();
    const { auth } = getBrowserDeps();
    const unsubscribe = auth.onAuthStateChange(() => {
      captureProviderTokens();
    });
    return () => unsubscribe();
  }, [captureProviderTokens]);

  async function connectCalendar() {
    if (working) return;
    setError(null);
    setWorking("calendar");
    sessionStorage.setItem(OAUTH_INTENT_KEY, "calendar");
    try {
      const { auth } = getBrowserDeps();
      const { url } = await auth.linkGoogleCalendar(
        window.location.origin + "/settings",
      );
      window.location.href = url;
    } catch (e) {
      sessionStorage.removeItem(OAUTH_INTENT_KEY);
      setWorking(null);
      setError(e instanceof Error ? e.message : "Failed to start OAuth");
    }
  }

  async function connectGmail() {
    if (working) return;
    setError(null);
    setWorking("gmail");
    sessionStorage.setItem(OAUTH_INTENT_KEY, "gmail");
    try {
      const { auth } = getBrowserDeps();
      const { url } = await auth.linkGoogleGmail(
        window.location.origin + "/settings",
      );
      window.location.href = url;
    } catch (e) {
      sessionStorage.removeItem(OAUTH_INTENT_KEY);
      setWorking(null);
      setError(e instanceof Error ? e.message : "Failed to start OAuth");
    }
  }

  return (
    <Section title="Integrations" fixed>
      <div className="space-y-3">
        <Card>
          <div className="flex items-start gap-3">
            <Calendar size={18} className="mt-0.5 shrink-0 text-fg-subtle" />
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="text-[14px] font-medium text-fg">
                  Google Calendar
                </p>
                <p className="mt-0.5 text-[13px] text-fg-muted">
                  Read-only access so Related can gauge your week&apos;s density
                  for catch-up timing.
                </p>
              </div>
              {calendarConnected ? (
                <p className="text-[13px] text-fg-muted">
                  <span aria-hidden="true">✓ </span>
                  Connected
                </p>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={working === "calendar"}
                  disabled={working !== null}
                  onClick={() => void connectCalendar()}
                >
                  Connect Google Calendar
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <Mail size={18} className="mt-0.5 shrink-0 text-fg-subtle" />
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="text-[14px] font-medium text-fg">Gmail</p>
                <p className="mt-0.5 text-[13px] text-fg-muted">
                  Read and send email with your contacts from their relationship
                  pages.
                </p>
              </div>
              {gmailConnected ? (
                <p className="text-[13px] text-fg-muted">
                  <span aria-hidden="true">✓ </span>
                  Connected
                </p>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={working === "gmail"}
                  disabled={working !== null}
                  onClick={() => void connectGmail()}
                >
                  Connect Gmail
                </Button>
              )}
            </div>
          </div>
        </Card>

        {error ? (
          <p className="text-[13px] text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Section>
  );
}
