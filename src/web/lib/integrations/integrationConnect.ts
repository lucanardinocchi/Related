import {
  generateCodeVerifier,
  generateCodeChallenge,
  mergeGoogleScopesOnConnect,
  type GoogleConnectIntent,
  tokenHasCalendarAccess,
  tokenHasGmailAccess,
  tokenHasInstagramAccess,
  tokenHasXAccess,
  tokenHasWhatsAppAccess,
  tokenHasTikTokAccess,
  tokenHasOutlookCalendarAccess,
  tokenHasOutlookMailAccess,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import {
  getIntegrationOAuthValue,
  isIntegrationOAuthCallbackPath,
  setIntegrationOAuthValue,
  clearIntegrationOAuthValue,
} from "./integrationOAuthStorage";
import { buildOutlookCallbackRedirectUri } from "./integrationOAuthOrigin";
import {
  clearIntegrationOAuthFeedback,
  setOAuthReturnPath,
} from "./oauthReturn";
import { triggerCalendarConnectSync } from "./calendarConnectSync";

export const OAUTH_INTENT_KEY = "related.google-oauth-intent";

/** Strips OAuth callback query params; keeps e.g. onboarding=1. */
export function buildOAuthReturnPath(pathname: string, search = ""): string {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  for (const key of ["code", "state", "error", "error_description"]) {
    params.delete(key);
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function normalizeGoogleIntent(raw: string | null): GoogleConnectIntent | null {
  if (raw === "gmail" || raw === "calendar") return raw;
  return null;
}

/**
 * Supabase Google OAuth redirect — must be allow-listed in Supabase Auth.
 * Routes through /auth/callback so PKCE exchange runs server-side (cookies).
 */
export function buildGoogleIntegrationRedirectUri(
  returnPath = "/settings",
  intent: GoogleConnectIntent,
): string {
  const path = returnPath.startsWith("/") ? returnPath : `/${returnPath}`;
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/auth/callback?next=${encodeURIComponent(path)}&google_intent=${intent}`;
}
const INSTAGRAM_OAUTH_STATE_KEY = "related.instagram-oauth-state";
const X_OAUTH_STATE_KEY = "related.x-oauth-state";
const X_CODE_VERIFIER_KEY = "related.x-oauth-code-verifier";
const TIKTOK_OAUTH_STATE_KEY = "related.tiktok-oauth-state";
const WHATSAPP_OAUTH_STATE_KEY = "related.whatsapp-oauth-state";
const OUTLOOK_OAUTH_STATE_KEY = "related.outlook-oauth-state";
const OUTLOOK_CODE_VERIFIER_KEY = "related.outlook-oauth-code-verifier";

export { OUTLOOK_OAUTH_STATE_KEY, OUTLOOK_CODE_VERIFIER_KEY };

export type IntegrationWorking =
  | "calendar"
  | "outlook"
  | "gmail"
  | "instagram"
  | "x"
  | "whatsapp"
  | "tiktok"
  | null;

export interface IntegrationEnvConfig {
  instagramAppId: string | null;
  xClientId: string | null;
  whatsappAppId: string | null;
  tiktokClientKey: string | null;
  microsoftClientId: string | null;
}

export async function refreshGoogleConnections(): Promise<{
  calendar: boolean;
  gmail: boolean;
}> {
  const { userProviderTokens } = getBrowserDeps();
  const token = await userProviderTokens.getForProvider("google");
  return {
    calendar: tokenHasCalendarAccess(token?.scopes),
    gmail: tokenHasGmailAccess(token?.scopes),
  };
}

export async function refreshOutlookConnection(): Promise<{
  calendar: boolean;
  mail: boolean;
}> {
  const { userProviderTokens } = getBrowserDeps();
  const token = await userProviderTokens.getForProvider("outlook");
  return {
    calendar: tokenHasOutlookCalendarAccess(token?.scopes),
    mail: tokenHasOutlookMailAccess(token?.scopes),
  };
}

export async function refreshInstagramConnection(): Promise<boolean> {
  const { userProviderTokens } = getBrowserDeps();
  const token = await userProviderTokens.getForProvider("instagram");
  return token !== null && tokenHasInstagramAccess(token.scopes);
}

export async function refreshXConnection(): Promise<boolean> {
  const { userProviderTokens } = getBrowserDeps();
  const token = await userProviderTokens.getForProvider("x");
  return token !== null && tokenHasXAccess(token.scopes);
}

export async function refreshWhatsAppConnection(): Promise<boolean> {
  const { userProviderTokens } = getBrowserDeps();
  const token = await userProviderTokens.getForProvider("whatsapp");
  return token !== null && tokenHasWhatsAppAccess(token.scopes);
}

export async function refreshTikTokConnection(): Promise<boolean> {
  const { userProviderTokens } = getBrowserDeps();
  const token = await userProviderTokens.getForProvider("tiktok");
  return token !== null && tokenHasTikTokAccess(token.scopes);
}

export async function captureGoogleProviderTokens(
  returnPath: string,
): Promise<{ calendar: boolean; gmail: boolean } | null> {
  let intent: string | null = null;
  if (typeof window !== "undefined") {
    if (isIntegrationOAuthCallbackPath(window.location.pathname)) {
      return null;
    }

    const params = new URLSearchParams(window.location.search);
    if (
      params.get("code") &&
      getIntegrationOAuthValue(OUTLOOK_OAUTH_STATE_KEY)
    ) {
      return null;
    }

    const oauthError = params.get("error");
    if (oauthError) {
      // Microsoft (and other providers) use ?error= on redirect; do not treat
      // as a Google Auth failure while a third-party OAuth flow is in flight.
      if (
        getIntegrationOAuthValue(OUTLOOK_OAUTH_STATE_KEY) ||
        params.get("code")
      ) {
        return null;
      }
      throw new Error(params.get("error_description") ?? oauthError);
    }

    intent = sessionStorage.getItem(OAUTH_INTENT_KEY);
  }

  const { auth, userProviderTokens, onboarding, supabase, resolveOwnerId } =
    getBrowserDeps();
  const session = await auth.getSessionWithProviderTokens();
  if (!session?.providerToken) return null;

  if (intent === null && typeof window !== "undefined") {
    intent = sessionStorage.getItem(OAUTH_INTENT_KEY);
  }
  const connectIntent = normalizeGoogleIntent(intent);
  const existing = await userProviderTokens.getForProvider("google");
  const scopes = mergeGoogleScopesOnConnect(existing?.scopes, connectIntent);
  const refreshToken =
    session.providerRefreshToken ?? existing?.refreshToken ?? null;

  await userProviderTokens.upsert({
    provider: "google",
    accessToken: session.providerToken,
    refreshToken,
    scopes,
    expiresAt:
      session.expiresAt !== null
        ? new Date(session.expiresAt * 1000).toISOString()
        : null,
  });

  if (typeof window !== "undefined") {
    sessionStorage.removeItem(OAUTH_INTENT_KEY);
    const cleanUrl = window.location.origin + returnPath;
    window.history.replaceState({}, "", cleanUrl);
  }

  const refreshed = await refreshGoogleConnections();
  if (refreshed.calendar) {
    await onboarding.completeStep("calendar");
    try {
      const ownerId = await resolveOwnerId();
      triggerCalendarConnectSync(supabase, ownerId);
    } catch {
      // Session edge case — sync can be retried from Settings.
    }
  }
  return refreshed;
}

export async function connectGoogleCalendar(returnPath: string): Promise<void> {
  setOAuthReturnPath(returnPath);
  sessionStorage.setItem(OAUTH_INTENT_KEY, "calendar");
  const { auth } = getBrowserDeps();
  const { url } = await auth.linkGoogleCalendar(
    buildGoogleIntegrationRedirectUri(returnPath, "calendar"),
  );
  window.location.href = url;
}

export async function connectGoogleGmail(returnPath: string): Promise<void> {
  setOAuthReturnPath(returnPath);
  sessionStorage.setItem(OAUTH_INTENT_KEY, "gmail");
  const { auth } = getBrowserDeps();
  const { url } = await auth.linkGoogleGmail(
    buildGoogleIntegrationRedirectUri(returnPath, "gmail"),
  );
  window.location.href = url;
}

export async function connectOutlookCalendar(
  returnPath: string,
  microsoftClientId: string,
): Promise<void> {
  clearIntegrationOAuthFeedback();
  setOAuthReturnPath(returnPath);
  const redirectUri = buildOutlookCallbackRedirectUri();
  const state = crypto.randomUUID();
  const codeVerifier = generateCodeVerifier();
  setIntegrationOAuthValue(OUTLOOK_CODE_VERIFIER_KEY, codeVerifier);
  setIntegrationOAuthValue(OUTLOOK_OAUTH_STATE_KEY, state);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const { auth } = getBrowserDeps();
  const url = auth.buildOutlookOAuthUrl({
    clientId: microsoftClientId,
    redirectUri,
    codeChallenge,
    state,
  });
  window.location.replace(url);
}

export async function connectInstagram(
  returnPath: string,
  _instagramAppId?: string | null,
  _whatsappAppId: string | null = null,
): Promise<void> {
  setOAuthReturnPath(returnPath);
  const response = await fetch("/api/integrations/instagram/authorize-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const payload = (await response.json()) as {
    url?: string;
    state?: string;
    error?: string;
  };
  if (!response.ok || !payload.url || !payload.state) {
    throw new Error(payload.error ?? "Failed to start Instagram OAuth");
  }
  sessionStorage.setItem(INSTAGRAM_OAUTH_STATE_KEY, payload.state);
  window.location.href = payload.url;
}

export async function connectX(
  returnPath: string,
  xClientId: string,
): Promise<void> {
  setOAuthReturnPath(returnPath);
  const redirectUri = window.location.origin + "/settings/x/callback";
  const state = crypto.randomUUID();
  const codeVerifier = generateCodeVerifier();
  sessionStorage.setItem(X_CODE_VERIFIER_KEY, codeVerifier);
  sessionStorage.setItem(X_OAUTH_STATE_KEY, state);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const { auth } = getBrowserDeps();
  const url = auth.buildXOAuthUrl({
    clientId: xClientId,
    redirectUri,
    codeChallenge,
    state,
  });
  window.location.href = url;
}

export async function connectWhatsApp(
  returnPath: string,
  whatsappAppId: string,
): Promise<void> {
  setOAuthReturnPath(returnPath);
  const redirectUri =
    window.location.origin + "/settings/whatsapp/callback";
  const state = crypto.randomUUID();
  sessionStorage.setItem(WHATSAPP_OAUTH_STATE_KEY, state);
  const { auth } = getBrowserDeps();
  const url = auth.buildWhatsAppOAuthUrl({
    appId: whatsappAppId,
    redirectUri,
    state,
  });
  window.location.href = url;
}

export async function connectTikTok(
  returnPath: string,
  tiktokClientKey: string,
): Promise<void> {
  setOAuthReturnPath(returnPath);
  const redirectUri =
    window.location.origin + "/settings/tiktok/callback";
  const state = crypto.randomUUID();
  sessionStorage.setItem(TIKTOK_OAUTH_STATE_KEY, state);
  const { auth } = getBrowserDeps();
  const url = auth.buildTikTokOAuthUrl({
    clientKey: tiktokClientKey,
    redirectUri,
    state,
  });
  window.location.href = url;
}
