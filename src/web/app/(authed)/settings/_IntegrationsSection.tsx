"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Calendar, Mail, AtSign, MessageCircle } from "lucide-react";
import {
  googleScopesWithoutCalendar,
  googleScopesWithoutGmail,
  tokenHasCalendarAccess,
  tokenHasGmailAccess,
  tokenHasInstagramAccess,
  tokenHasXAccess,
  tokenHasWhatsAppAccess,
  tokenHasTikTokAccess,
  tokenHasOutlookCalendarAccess,
  tokenHasOutlookMailAccess,
  generateCodeVerifier,
  generateCodeChallenge,
} from "@related/shared";
import { Card, Section } from "@/components/ui";
import { IntegrationConnectionActions } from "@/components/integrations/IntegrationConnectionActions";
import { getBrowserDeps } from "@/lib/deps/client";
import { isIntegrationComingSoon } from "@/lib/integrations/integrationAvailability";
import {
  probeIntegrationHealth,
  type IntegrationHealthFlags,
} from "@/lib/integrations/integrationHealth";
import {
  buildGoogleIntegrationRedirectUri,
  captureGoogleProviderTokens,
  OAUTH_INTENT_KEY,
} from "@/lib/integrations/integrationConnect";
import {
  consumeIntegrationOAuthError,
  consumeIntegrationOAuthQueryFeedback,
  setOAuthReturnPath,
} from "@/lib/integrations/oauthReturn";
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
  initialOutlookMailConnected: boolean;
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
  initialOutlookMailConnected,
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
  const [outlookMailConnected, setOutlookMailConnected] = useState(
    initialOutlookMailConnected,
  );
  const [working, setWorking] = useState<
    | "calendar"
    | "disconnect-calendar"
    | "outlook"
    | "disconnect-outlook"
    | "gmail"
    | "disconnect-gmail"
    | "instagram"
    | "disconnect-instagram"
    | "x"
    | "disconnect-x"
    | "whatsapp"
    | "disconnect-whatsapp"
    | "tiktok"
    | "disconnect-tiktok"
    | null
  >(null);
  const [needsReconsent, setNeedsReconsent] = useState<IntegrationHealthFlags>({
    googleCalendar: false,
    gmail: false,
    outlookCalendar: false,
    outlookMail: false,
    instagram: false,
    x: false,
    whatsapp: false,
    tiktok: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const captureRunning = useRef(false);
  const healthProbeRunning = useRef(false);

  const captureProviderTokens = useCallback(async () => {
    if (captureRunning.current) return;
    captureRunning.current = true;
    try {
      const result = await captureGoogleProviderTokens("/settings");
      if (result) {
        setCalendarConnected(result.calendar);
        setGmailConnected(result.gmail);
      }
      setWorking(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to save Google connection",
      );
      setWorking(null);
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", window.location.pathname);
      }
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
    setOutlookMailConnected(
      token !== null && tokenHasOutlookMailAccess(token.scopes),
    );
  }, []);

  const runHealthProbe = useCallback(async () => {
    if (healthProbeRunning.current) return;
    healthProbeRunning.current = true;
    try {
      const flags = await probeIntegrationHealth();
      setNeedsReconsent(flags);
    } catch {
      // Non-fatal — connection state still shown from tokens.
    } finally {
      healthProbeRunning.current = false;
    }
  }, []);

  useEffect(() => {
    setOAuthReturnPath("/settings");
    const queryFeedback = consumeIntegrationOAuthQueryFeedback();
    const stashedError = consumeIntegrationOAuthError();
    if (queryFeedback.error ?? stashedError) {
      setError(queryFeedback.error ?? stashedError);
    }
    if (queryFeedback.success === "outlook") {
      setSuccess("Outlook connected.");
    }
    captureProviderTokens();
    void refreshInstagramConnection();
    void refreshXConnection();
    void refreshWhatsAppConnection();
    void refreshTikTokConnection();
    void refreshOutlookConnection();
    void runHealthProbe();
    const { auth } = getBrowserDeps();
    const unsubscribe = auth.onAuthStateChange(() => {
      captureProviderTokens();
      void runHealthProbe();
    });
    return () => unsubscribe();
  }, [
    captureProviderTokens,
    refreshInstagramConnection,
    refreshXConnection,
    refreshWhatsAppConnection,
    refreshTikTokConnection,
    refreshOutlookConnection,
    runHealthProbe,
  ]);

  const busy = working !== null;

  async function disconnectGoogleCalendar() {
    if (busy) return;
    setError(null);
    setWorking("disconnect-calendar");
    try {
      const { userProviderTokens } = getBrowserDeps();
      const token = await userProviderTokens.getForProvider("google");
      if (!token?.scopes) {
        setCalendarConnected(false);
        setNeedsReconsent((f) => ({ ...f, googleCalendar: false }));
        return;
      }
      const remaining = googleScopesWithoutCalendar(token.scopes);
      if (remaining === null) {
        await userProviderTokens.deleteForProvider("google");
        setCalendarConnected(false);
        setGmailConnected(false);
        setNeedsReconsent((f) => ({ ...f, googleCalendar: false, gmail: false }));
      } else {
        await userProviderTokens.updateScopes("google", remaining);
        setCalendarConnected(false);
        setNeedsReconsent((f) => ({ ...f, googleCalendar: false }));
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to disconnect Google Calendar",
      );
    } finally {
      setWorking(null);
    }
  }

  async function disconnectGmail() {
    if (busy) return;
    setError(null);
    setWorking("disconnect-gmail");
    try {
      const { userProviderTokens } = getBrowserDeps();
      const token = await userProviderTokens.getForProvider("google");
      if (!token?.scopes) {
        setGmailConnected(false);
        setNeedsReconsent((f) => ({ ...f, gmail: false }));
        return;
      }
      const remaining = googleScopesWithoutGmail(token.scopes);
      if (remaining === null) {
        await userProviderTokens.deleteForProvider("google");
        setCalendarConnected(false);
        setGmailConnected(false);
        setNeedsReconsent((f) => ({ ...f, googleCalendar: false, gmail: false }));
      } else {
        await userProviderTokens.updateScopes("google", remaining);
        setGmailConnected(false);
        setNeedsReconsent((f) => ({ ...f, gmail: false }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disconnect Gmail");
    } finally {
      setWorking(null);
    }
  }

  async function disconnectOutlook() {
    if (busy) return;
    setError(null);
    setWorking("disconnect-outlook");
    try {
      const { userProviderTokens } = getBrowserDeps();
      await userProviderTokens.deleteForProvider("outlook");
      setOutlookCalendarConnected(false);
      setOutlookMailConnected(false);
      setNeedsReconsent((f) => ({
        ...f,
        outlookCalendar: false,
        outlookMail: false,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disconnect Outlook");
    } finally {
      setWorking(null);
    }
  }

  async function disconnectProvider(
    provider: "instagram" | "x" | "whatsapp" | "tiktok",
    workingKey:
      | "disconnect-instagram"
      | "disconnect-x"
      | "disconnect-whatsapp"
      | "disconnect-tiktok",
    setConnected: (v: boolean) => void,
    clearReconsent: (f: IntegrationHealthFlags) => IntegrationHealthFlags,
  ) {
    if (busy) return;
    setError(null);
    setWorking(workingKey);
    try {
      const { userProviderTokens } = getBrowserDeps();
      await userProviderTokens.deleteForProvider(provider);
      setConnected(false);
      setNeedsReconsent(clearReconsent);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : `Failed to disconnect ${provider}`,
      );
    } finally {
      setWorking(null);
    }
  }

  async function connectCalendar() {
    if (working) return;
    setError(null);
    setWorking("calendar");
    sessionStorage.setItem(OAUTH_INTENT_KEY, "calendar");
    try {
      const { auth } = getBrowserDeps();
      const { url } = await auth.linkGoogleCalendar(
        buildGoogleIntegrationRedirectUri(),
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
        buildGoogleIntegrationRedirectUri(),
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
              <IntegrationConnectionActions
                connected={calendarConnected}
                needsReconsent={needsReconsent.googleCalendar}
                connectLabel="Connect Google Calendar"
                onConnect={() => void connectCalendar()}
                onReconnect={() => void connectCalendar()}
                onDisconnect={() => void disconnectGoogleCalendar()}
                connectLoading={working === "calendar"}
                disconnectLoading={working === "disconnect-calendar"}
                disabled={busy}
              />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <Calendar size={18} className="mt-0.5 shrink-0 text-fg-subtle" />
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="text-[14px] font-medium text-fg">
                  Outlook
                </p>
                <p className="mt-0.5 text-[13px] text-fg-muted">
                  Read-only calendar plus read/send email with contacts from
                  their relationship pages.
                </p>
              </div>
              {outlookCalendarConnected || outlookMailConnected ? (
                <div className="space-y-2">
                  <div className="space-y-1 text-[13px] text-fg-muted">
                    <p>
                      <span aria-hidden="true">
                        {outlookCalendarConnected ? "✓" : "○"}{" "}
                      </span>
                      Calendar
                      {outlookCalendarConnected ? " connected" : " not connected"}
                      {needsReconsent.outlookCalendar ? " (expired)" : ""}
                    </p>
                    <p>
                      <span aria-hidden="true">
                        {outlookMailConnected ? "✓" : "○"}{" "}
                      </span>
                      Mail
                      {outlookMailConnected ? " connected" : " not connected"}
                      {needsReconsent.outlookMail ? " (expired)" : ""}
                    </p>
                  </div>
                  <IntegrationConnectionActions
                    connected
                    needsReconsent={
                      needsReconsent.outlookCalendar || needsReconsent.outlookMail
                    }
                    connectLabel="Connect Outlook"
                    onConnect={() => void connectOutlookCalendar()}
                    onReconnect={() => void connectOutlookCalendar()}
                    onDisconnect={() => void disconnectOutlook()}
                    connectLoading={working === "outlook"}
                    disconnectLoading={working === "disconnect-outlook"}
                    disabled={busy}
                  />
                  {!outlookCalendarConnected || !outlookMailConnected ? (
                    !microsoftClientId ? null : (
                      <p className="text-[12px] text-fg-subtle">
                        Use Reconnect to add missing Calendar or Mail access.
                      </p>
                    )
                  ) : null}
                </div>
              ) : !microsoftClientId ? (
                <p className="text-[13px] text-fg-muted">
                  Set{" "}
                  <code className="text-[12px]">
                    NEXT_PUBLIC_MICROSOFT_CLIENT_ID
                  </code>{" "}
                  to enable Outlook connect.
                </p>
              ) : (
                <IntegrationConnectionActions
                  connected={false}
                  connectLabel="Connect Outlook"
                  onConnect={() => void connectOutlookCalendar()}
                  connectLoading={working === "outlook"}
                  disabled={busy}
                />
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
              <IntegrationConnectionActions
                connected={gmailConnected}
                needsReconsent={needsReconsent.gmail}
                connectLabel="Connect Gmail"
                onConnect={() => void connectGmail()}
                onReconnect={() => void connectGmail()}
                onDisconnect={() => void disconnectGmail()}
                connectLoading={working === "gmail"}
                disconnectLoading={working === "disconnect-gmail"}
                disabled={busy}
              />
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
              {!instagramAppId ? (
                <p className="text-[13px] text-fg-muted">
                  Set{" "}
                  <code className="text-[12px]">NEXT_PUBLIC_INSTAGRAM_APP_ID</code>{" "}
                  to enable Instagram connect.
                </p>
              ) : (
                <IntegrationConnectionActions
                  connected={instagramConnected}
                  needsReconsent={needsReconsent.instagram}
                  connectLabel="Connect Instagram"
                  onConnect={() => void connectInstagram()}
                  onReconnect={() => void connectInstagram()}
                  onDisconnect={() =>
                    void disconnectProvider(
                      "instagram",
                      "disconnect-instagram",
                      setInstagramConnected,
                      (f) => ({ ...f, instagram: false }),
                    )
                  }
                  connectLoading={working === "instagram"}
                  disconnectLoading={working === "disconnect-instagram"}
                  disabled={busy}
                />
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
              {!xClientId ? (
                <p className="text-[13px] text-fg-muted">
                  Set{" "}
                  <code className="text-[12px]">NEXT_PUBLIC_X_CLIENT_ID</code>{" "}
                  to enable X connect.
                </p>
              ) : (
                <IntegrationConnectionActions
                  connected={xConnected}
                  needsReconsent={needsReconsent.x}
                  connectLabel="Connect X"
                  onConnect={() => void connectX()}
                  onReconnect={() => void connectX()}
                  onDisconnect={() =>
                    void disconnectProvider(
                      "x",
                      "disconnect-x",
                      setXConnected,
                      (f) => ({ ...f, x: false }),
                    )
                  }
                  connectLoading={working === "x"}
                  disconnectLoading={working === "disconnect-x"}
                  disabled={busy}
                />
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
              {isIntegrationComingSoon("whatsapp") ? (
                <p className="text-[13px] text-fg-muted">Coming soon</p>
              ) : !whatsappAppId ? (
                <p className="text-[13px] text-fg-muted">
                  Set{" "}
                  <code className="text-[12px]">
                    NEXT_PUBLIC_WHATSAPP_APP_ID
                  </code>{" "}
                  to enable WhatsApp connect.
                </p>
              ) : (
                <IntegrationConnectionActions
                  connected={whatsappConnected}
                  needsReconsent={needsReconsent.whatsapp}
                  connectLabel="Connect WhatsApp"
                  onConnect={() => void connectWhatsApp()}
                  onReconnect={() => void connectWhatsApp()}
                  onDisconnect={() =>
                    void disconnectProvider(
                      "whatsapp",
                      "disconnect-whatsapp",
                      setWhatsappConnected,
                      (f) => ({ ...f, whatsapp: false }),
                    )
                  }
                  connectLoading={working === "whatsapp"}
                  disconnectLoading={working === "disconnect-whatsapp"}
                  disabled={busy}
                />
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
              {isIntegrationComingSoon("tiktok") ? (
                <p className="text-[13px] text-fg-muted">Coming soon</p>
              ) : !tiktokClientKey ? (
                <p className="text-[13px] text-fg-muted">
                  Set{" "}
                  <code className="text-[12px]">
                    NEXT_PUBLIC_TIKTOK_CLIENT_KEY
                  </code>{" "}
                  to enable TikTok connect.
                </p>
              ) : (
                <IntegrationConnectionActions
                  connected={tiktokConnected}
                  needsReconsent={needsReconsent.tiktok}
                  connectLabel="Connect TikTok"
                  onConnect={() => void connectTikTok()}
                  onReconnect={() => void connectTikTok()}
                  onDisconnect={() =>
                    void disconnectProvider(
                      "tiktok",
                      "disconnect-tiktok",
                      setTiktokConnected,
                      (f) => ({ ...f, tiktok: false }),
                    )
                  }
                  connectLoading={working === "tiktok"}
                  disconnectLoading={working === "disconnect-tiktok"}
                  disabled={busy}
                />
              )}
            </div>
          </div>
        </Card>

        {success ? (
          <p className="text-[13px] text-fg" role="status">
            {success}
          </p>
        ) : null}
        {error ? (
          <p className="text-[13px] text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Section>
  );
}
