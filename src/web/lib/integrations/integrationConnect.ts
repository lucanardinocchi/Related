import {
  generateCodeVerifier,
  generateCodeChallenge,
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_INTEGRATION_SCOPES,
  tokenHasCalendarAccess,
  tokenHasGmailAccess,
  tokenHasInstagramAccess,
  tokenHasXAccess,
  tokenHasWhatsAppAccess,
  tokenHasTikTokAccess,
  tokenHasOutlookCalendarAccess,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import { setOAuthReturnPath } from "./oauthReturn";

export const OAUTH_INTENT_KEY = "related.google-oauth-intent";
const INSTAGRAM_OAUTH_STATE_KEY = "related.instagram-oauth-state";
const X_OAUTH_STATE_KEY = "related.x-oauth-state";
const X_CODE_VERIFIER_KEY = "related.x-oauth-code-verifier";
const TIKTOK_OAUTH_STATE_KEY = "related.tiktok-oauth-state";
const WHATSAPP_OAUTH_STATE_KEY = "related.whatsapp-oauth-state";
const OUTLOOK_OAUTH_STATE_KEY = "related.outlook-oauth-state";
const OUTLOOK_CODE_VERIFIER_KEY = "related.outlook-oauth-code-verifier";

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

export async function refreshOutlookConnection(): Promise<boolean> {
  const { userProviderTokens } = getBrowserDeps();
  const token = await userProviderTokens.getForProvider("outlook");
  return token !== null && tokenHasOutlookCalendarAccess(token.scopes);
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
  const { auth, userProviderTokens, onboarding } = getBrowserDeps();
  const session = await auth.getSessionWithProviderTokens();
  if (!session?.providerToken) return null;

  const intent =
    typeof window !== "undefined"
      ? sessionStorage.getItem(OAUTH_INTENT_KEY)
      : null;
  const scopes =
    intent === "gmail" ? GOOGLE_INTEGRATION_SCOPES : GOOGLE_CALENDAR_SCOPES;

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
    const cleanUrl = window.location.origin + returnPath;
    window.history.replaceState({}, "", cleanUrl);
  }

  const refreshed = await refreshGoogleConnections();
  if (refreshed.calendar) {
    await onboarding.completeStep("calendar");
  }
  return refreshed;
}

export async function connectGoogleCalendar(returnPath: string): Promise<void> {
  setOAuthReturnPath(returnPath);
  sessionStorage.setItem(OAUTH_INTENT_KEY, "calendar");
  const { auth } = getBrowserDeps();
  const { url } = await auth.linkGoogleCalendar(
    window.location.origin + returnPath,
  );
  window.location.href = url;
}

export async function connectGoogleGmail(returnPath: string): Promise<void> {
  setOAuthReturnPath(returnPath);
  sessionStorage.setItem(OAUTH_INTENT_KEY, "gmail");
  const { auth } = getBrowserDeps();
  const { url } = await auth.linkGoogleGmail(
    window.location.origin + returnPath,
  );
  window.location.href = url;
}

export async function connectOutlookCalendar(
  returnPath: string,
  microsoftClientId: string,
): Promise<void> {
  setOAuthReturnPath(returnPath);
  const redirectUri =
    window.location.origin + "/settings/outlook/callback";
  const state = crypto.randomUUID();
  const codeVerifier = generateCodeVerifier();
  sessionStorage.setItem(OUTLOOK_CODE_VERIFIER_KEY, codeVerifier);
  sessionStorage.setItem(OUTLOOK_OAUTH_STATE_KEY, state);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const { auth } = getBrowserDeps();
  const url = auth.buildOutlookOAuthUrl({
    clientId: microsoftClientId,
    redirectUri,
    codeChallenge,
    state,
  });
  window.location.href = url;
}

export async function connectInstagram(
  returnPath: string,
  instagramAppId: string,
): Promise<void> {
  setOAuthReturnPath(returnPath);
  const redirectUri =
    window.location.origin + "/settings/instagram/callback";
  sessionStorage.setItem(INSTAGRAM_OAUTH_STATE_KEY, "connect");
  const { auth } = getBrowserDeps();
  const url = auth.buildInstagramOAuthUrl({
    appId: instagramAppId,
    redirectUri,
  });
  window.location.href = url;
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
