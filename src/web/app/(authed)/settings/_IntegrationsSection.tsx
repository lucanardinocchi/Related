"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Calendar, Mail, AtSign, MessageCircle } from "lucide-react";
import {
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_INTEGRATION_SCOPES,
  tokenHasCalendarAccess,
  tokenHasGmailAccess,
  tokenHasInstagramAccess,
  tokenHasXAccess,
  tokenHasWhatsAppAccess,
  tokenHasTikTokAccess,
  tokenHasOutlookCalendarAccess,
  generateCodeVerifier,
  generateCodeChallenge,
} from "@related/shared";
import { Button, Card, Section } from "@/components/ui";
import { getBrowserDeps } from "@/lib/deps/client";
import { setOAuthReturnPath } from "@/lib/integrations/oauthReturn";

const OAUTH_INTENT_KEY = "related.google-oauth-intent";
const INSTAGRAM_OAUTH_STATE_KEY = "related.instagram-oauth-state";
const X_OAUTH_STATE_KEY = "related.x-oauth-state";
const X_CODE_VERIFIER_KEY = "related.x-oauth-code-verifier";
const TIKTOK_OAUTH_STATE_KEY = "related.tiktok-oauth-state";
const WHATSAPP_OAUTH_STATE_KEY = "related.whatsapp-oauth-state";
const OUTLOOK_OAUTH_STATE_KEY = "related.outlook-oauth-state";
const OUTLOOK_CODE_VERIFIER_KEY = "related.outlook-oauth-code-verifier";

interface Props {
  initialCalendarConnected: boolean;
  initialGmailConnected: boolean;
  initialInstagramConnected: boolean;
  initialXConnected: boolean;
  initialWhatsAppConnected: boolean;
  initialTikTokConnected: boolean;
  initialOutlookCalendarConnected: boolean;
  instagramAppId: string | null;
  xClientId: string | null;
  whatsappAppId: string | null;
  tiktokClientKey: string | null;
  microsoftClientId: string | null;
}

export function IntegrationsSection({
  initialCalendarConnected,
  initialGmailConnected,
  initialInstagramConnected,
  initialXConnected,
  initialWhatsAppConnected,
  initialTikTokConnected,
  initialOutlookCalendarConnected,
  instagramAppId,
  xClientId,
  whatsappAppId,
  tiktokClientKey,
  microsoftClientId,
}: Props) {
  const [calendarConnected, setCalendarConnected] = useState(
    initialCalendarConnected,
  );
  const [gmailConnected, setGmailConnected] = useState(initialGmailConnected);
  const [instagramConnected, setInstagramConnected] = useState(
    initialInstagramConnected,
  );
  const [xConnected, setXConnected] = useState(initialXConnected);
  const [whatsappConnected, setWhatsappConnected] = useState(
    initialWhatsAppConnected,
  );
  const [tiktokConnected, setTiktokConnected] = useState(initialTikTokConnected);
  const [outlookCalendarConnected, setOutlookCalendarConnected] = useState(
    initialOutlookCalendarConnected,
  );
  const [working, setWorking] = useState<
    | "calendar"
    | "outlook"
    | "gmail"
    | "instagram"
    | "x"
    | "whatsapp"
    | "tiktok"
    | null
  >(null);
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

  const refreshInstagramConnection = useCallback(async () => {
    const { userProviderTokens } = getBrowserDeps();
    const token = await userProviderTokens.getForProvider("instagram");
    setInstagramConnected(
      token !== null && tokenHasInstagramAccess(token.scopes),
    );
  }, []);

  const refreshXConnection = useCallback(async () => {
    const { userProviderTokens } = getBrowserDeps();
    const token = await userProviderTokens.getForProvider("x");
    setXConnected(token !== null && tokenHasXAccess(token.scopes));
  }, []);

  const refreshWhatsAppConnection = useCallback(async () => {
    const { userProviderTokens } = getBrowserDeps();
    const token = await userProviderTokens.getForProvider("whatsapp");
    setWhatsappConnected(
      token !== null && tokenHasWhatsAppAccess(token.scopes),
    );
  }, []);

  const refreshTikTokConnection = useCallback(async () => {
    const { userProviderTokens } = getBrowserDeps();
    const token = await userProviderTokens.getForProvider("tiktok");
    setTiktokConnected(token !== null && tokenHasTikTokAccess(token.scopes));
  }, []);

  const refreshOutlookConnection = useCallback(async () => {
    const { userProviderTokens } = getBrowserDeps();
    const token = await userProviderTokens.getForProvider("outlook");
    setOutlookCalendarConnected(
      token !== null && tokenHasOutlookCalendarAccess(token.scopes),
    );
  }, []);

  useEffect(() => {
    setOAuthReturnPath("/settings");
    captureProviderTokens();
    void refreshInstagramConnection();
    void refreshXConnection();
    void refreshWhatsAppConnection();
    void refreshTikTokConnection();
    void refreshOutlookConnection();
    const { auth } = getBrowserDeps();
    const unsubscribe = auth.onAuthStateChange(() => {
      captureProviderTokens();
    });
    return () => unsubscribe();
  }, [
    captureProviderTokens,
    refreshInstagramConnection,
    refreshXConnection,
    refreshWhatsAppConnection,
    refreshTikTokConnection,
    refreshOutlookConnection,
  ]);

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

  async function connectOutlookCalendar() {
    if (working || !microsoftClientId) return;
    setError(null);
    setWorking("outlook");
    const redirectUri =
      window.location.origin + "/settings/outlook/callback";
    const state = crypto.randomUUID();
    const codeVerifier = generateCodeVerifier();
    sessionStorage.setItem(OUTLOOK_CODE_VERIFIER_KEY, codeVerifier);
    sessionStorage.setItem(OUTLOOK_OAUTH_STATE_KEY, state);
    try {
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const { auth } = getBrowserDeps();
      const url = auth.buildOutlookOAuthUrl({
        clientId: microsoftClientId,
        redirectUri,
        codeChallenge,
        state,
      });
      window.location.href = url;
    } catch (e) {
      sessionStorage.removeItem(OUTLOOK_CODE_VERIFIER_KEY);
      sessionStorage.removeItem(OUTLOOK_OAUTH_STATE_KEY);
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

  async function connectInstagram() {
    if (working || !instagramAppId) return;
    setError(null);
    setWorking("instagram");
    const redirectUri =
      window.location.origin + "/settings/instagram/callback";
    sessionStorage.setItem(INSTAGRAM_OAUTH_STATE_KEY, "connect");
    try {
      const { auth } = getBrowserDeps();
      const url = auth.buildInstagramOAuthUrl({
        appId: instagramAppId,
        redirectUri,
      });
      window.location.href = url;
    } catch (e) {
      sessionStorage.removeItem(INSTAGRAM_OAUTH_STATE_KEY);
      setWorking(null);
      setError(e instanceof Error ? e.message : "Failed to start OAuth");
    }
  }

  async function connectX() {
    if (working || !xClientId) return;
    setError(null);
    setWorking("x");
    const redirectUri = window.location.origin + "/settings/x/callback";
    const state = crypto.randomUUID();
    const codeVerifier = generateCodeVerifier();
    sessionStorage.setItem(X_CODE_VERIFIER_KEY, codeVerifier);
    sessionStorage.setItem(X_OAUTH_STATE_KEY, state);
    try {
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const { auth } = getBrowserDeps();
      const url = auth.buildXOAuthUrl({
        clientId: xClientId,
        redirectUri,
        codeChallenge,
        state,
      });
      window.location.href = url;
    } catch (e) {
      sessionStorage.removeItem(X_CODE_VERIFIER_KEY);
      sessionStorage.removeItem(X_OAUTH_STATE_KEY);
      setWorking(null);
      setError(e instanceof Error ? e.message : "Failed to start OAuth");
    }
  }

  async function connectWhatsApp() {
    if (working || !whatsappAppId) return;
    setError(null);
    setWorking("whatsapp");
    const redirectUri =
      window.location.origin + "/settings/whatsapp/callback";
    const state = crypto.randomUUID();
    sessionStorage.setItem(WHATSAPP_OAUTH_STATE_KEY, state);
    try {
      const { auth } = getBrowserDeps();
      const url = auth.buildWhatsAppOAuthUrl({
        appId: whatsappAppId,
        redirectUri,
        state,
      });
      window.location.href = url;
    } catch (e) {
      sessionStorage.removeItem(WHATSAPP_OAUTH_STATE_KEY);
      setWorking(null);
      setError(e instanceof Error ? e.message : "Failed to start OAuth");
    }
  }

  async function connectTikTok() {
    if (working || !tiktokClientKey) return;
    setError(null);
    setWorking("tiktok");
    const redirectUri =
      window.location.origin + "/settings/tiktok/callback";
    const state = crypto.randomUUID();
    sessionStorage.setItem(TIKTOK_OAUTH_STATE_KEY, state);
    try {
      const { auth } = getBrowserDeps();
      const url = auth.buildTikTokOAuthUrl({
        clientKey: tiktokClientKey,
        redirectUri,
        state,
      });
      window.location.href = url;
    } catch (e) {
      sessionStorage.removeItem(TIKTOK_OAUTH_STATE_KEY);
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
            <Calendar size={18} className="mt-0.5 shrink-0 text-fg-subtle" />
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="text-[14px] font-medium text-fg">
                  Outlook Calendar
                </p>
                <p className="mt-0.5 text-[13px] text-fg-muted">
                  Read-only access to your Outlook calendar for the same
                  week-density signal as Google Calendar.
                </p>
              </div>
              {outlookCalendarConnected ? (
                <p className="text-[13px] text-fg-muted">
                  <span aria-hidden="true">✓ </span>
                  Connected
                </p>
              ) : !microsoftClientId ? (
                <p className="text-[13px] text-fg-muted">
                  Set{" "}
                  <code className="text-[12px]">
                    NEXT_PUBLIC_MICROSOFT_CLIENT_ID
                  </code>{" "}
                  to enable Outlook connect.
                </p>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={working === "outlook"}
                  disabled={working !== null}
                  onClick={() => void connectOutlookCalendar()}
                >
                  Connect Outlook Calendar
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

        <Card>
          <div className="flex items-start gap-3">
            <AtSign size={18} className="mt-0.5 shrink-0 text-fg-subtle" />
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="text-[14px] font-medium text-fg">Instagram</p>
                <p className="mt-0.5 text-[13px] text-fg-muted">
                  Read and send DMs from your creator account on relationship
                  pages. Requires an Instagram professional/creator account.
                </p>
              </div>
              {instagramConnected ? (
                <p className="text-[13px] text-fg-muted">
                  <span aria-hidden="true">✓ </span>
                  Connected
                </p>
              ) : !instagramAppId ? (
                <p className="text-[13px] text-fg-muted">
                  Set{" "}
                  <code className="text-[12px]">NEXT_PUBLIC_INSTAGRAM_APP_ID</code>{" "}
                  to enable Instagram connect.
                </p>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={working === "instagram"}
                  disabled={working !== null}
                  onClick={() => void connectInstagram()}
                >
                  Connect Instagram
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 text-[18px] leading-none text-fg-subtle">
              𝕏
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="text-[14px] font-medium text-fg">X</p>
                <p className="mt-0.5 text-[13px] text-fg-muted">
                  Read and send DMs from relationship and group pages. Requires
                  X API access with DM permissions.
                </p>
              </div>
              {xConnected ? (
                <p className="text-[13px] text-fg-muted">
                  <span aria-hidden="true">✓ </span>
                  Connected
                </p>
              ) : !xClientId ? (
                <p className="text-[13px] text-fg-muted">
                  Set{" "}
                  <code className="text-[12px]">NEXT_PUBLIC_X_CLIENT_ID</code>{" "}
                  to enable X connect.
                </p>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={working === "x"}
                  disabled={working !== null}
                  onClick={() => void connectX()}
                >
                  Connect X
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <MessageCircle
              size={18}
              className="mt-0.5 shrink-0 text-fg-subtle"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="text-[14px] font-medium text-fg">WhatsApp</p>
                <p className="mt-0.5 text-[13px] text-fg-muted">
                  Read and send DMs from relationship and group pages via
                  WhatsApp Business Cloud API. Requires a Meta Business app
                  with WhatsApp enabled.
                </p>
              </div>
              {whatsappConnected ? (
                <p className="text-[13px] text-fg-muted">
                  <span aria-hidden="true">✓ </span>
                  Connected
                </p>
              ) : !whatsappAppId ? (
                <p className="text-[13px] text-fg-muted">
                  Set{" "}
                  <code className="text-[12px]">
                    NEXT_PUBLIC_WHATSAPP_APP_ID
                  </code>{" "}
                  to enable WhatsApp connect.
                </p>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={working === "whatsapp"}
                  disabled={working !== null}
                  onClick={() => void connectWhatsApp()}
                >
                  Connect WhatsApp
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 text-[18px] leading-none text-fg-subtle">
              ♪
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="text-[14px] font-medium text-fg">TikTok</p>
                <p className="mt-0.5 text-[13px] text-fg-muted">
                  Read and send DMs from relationship and group pages. Requires
                  a TikTok Business Account with Business Messaging access.
                </p>
              </div>
              {tiktokConnected ? (
                <p className="text-[13px] text-fg-muted">
                  <span aria-hidden="true">✓ </span>
                  Connected
                </p>
              ) : !tiktokClientKey ? (
                <p className="text-[13px] text-fg-muted">
                  Set{" "}
                  <code className="text-[12px]">
                    NEXT_PUBLIC_TIKTOK_CLIENT_KEY
                  </code>{" "}
                  to enable TikTok connect.
                </p>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={working === "tiktok"}
                  disabled={working !== null}
                  onClick={() => void connectTikTok()}
                >
                  Connect TikTok
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
