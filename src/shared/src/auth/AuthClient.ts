import {
  createClient,
  SupabaseClient,
  User as SbUser,
  Session as SbSession,
} from "@supabase/supabase-js";
import {
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_INTEGRATION_SCOPES,
} from "../integrations/google/googleScopes";
import { INSTAGRAM_INTEGRATION_SCOPES } from "../integrations/instagram/instagramScopes";
import { X_INTEGRATION_SCOPES } from "../integrations/x/xScopes";
import { WHATSAPP_INTEGRATION_SCOPES } from "../integrations/whatsapp/whatsappScopes";
import { TIKTOK_INTEGRATION_SCOPES } from "../integrations/tiktok/tiktokScopes";
import { OUTLOOK_INTEGRATION_SCOPES } from "../integrations/outlook/outlookScopes";
import type { OAuthSignInProvider } from "./oauthProviders";

export interface AuthClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface Session {
  access_token: string;
  user: AuthUser;
}

/**
 * Session shape that exposes OAuth provider tokens — only populated
 * immediately after returning from an OAuth callback (linkIdentity or
 * signInWithOAuth). Supabase Auth doesn't persist these; OnboardingScreen
 * captures them on return and stores them in user_provider_tokens.
 */
export interface SessionWithProviderTokens {
  accessToken: string;
  providerToken: string | null;
  providerRefreshToken: string | null;
  /** Seconds since epoch (Supabase shape). */
  expiresAt: number | null;
}

export type Unsubscribe = () => void;

function resolveEmail(sbUser: SbUser): string {
  const email =
    sbUser.email ??
    (typeof sbUser.user_metadata?.email === "string"
      ? sbUser.user_metadata.email
      : undefined);
  if (!email) {
    throw new Error("Supabase user is missing an email address.");
  }
  return email;
}

function toSession(sbSession: SbSession, sbUser: SbUser): Session {
  return {
    access_token: sbSession.access_token,
    user: { id: sbUser.id, email: resolveEmail(sbUser) },
  };
}

/**
 * Thin wrapper around Supabase Auth. Every other module in the app talks to
 * Supabase Auth through this surface — keep it small and stable.
 *
 * Constructor takes a `SupabaseClient` directly (dependency injection) so
 * tests can pass a mock. For production code, use `AuthClient.fromConfig`.
 */
export class AuthClient {
  constructor(private readonly client: SupabaseClient) {}

  static fromConfig(config: AuthClientConfig): AuthClient {
    return new AuthClient(
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false },
      }),
    );
  }

  async signUp(email: string, password: string): Promise<Session> {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
    if (!data.session || !data.user) {
      throw new Error(
        "Sign-up did not return a session — email confirmation is likely enabled on the Supabase project.",
      );
    }
    return toSession(data.session, data.user);
  }

  async signIn(email: string, password: string): Promise<Session> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    if (!data.session || !data.user) {
      throw new Error("Sign-in did not return a session.");
    }
    return toSession(data.session, data.user);
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  /**
   * Starts Google or Apple OAuth sign-in. Returns the provider URL — the
   * caller navigates to it (web: full redirect; native: in-app browser).
   * `redirectTo` must be allow-listed in Supabase (e.g. `/auth/callback`
   * on web or `related://auth-callback` on native).
   */
  async signInWithOAuth(
    provider: OAuthSignInProvider,
    redirectTo: string,
  ): Promise<{ url: string }> {
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        ...(provider === "google"
          ? {
              queryParams: {
                access_type: "online",
                prompt: "select_account",
              },
            }
          : {}),
      },
    });
    if (error) throw error;
    if (!data?.url) {
      throw new Error("signInWithOAuth returned no OAuth URL");
    }
    return { url: data.url };
  }

  /**
   * Sends a password-reset email. The link redirects to `redirectTo`
   * (typically `/auth/callback?next=/reset-password` on web).
   */
  async requestPasswordReset(email: string, redirectTo: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) throw error;
  }

  /** Sets a new password for the currently signed-in User (recovery session). */
  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  async getSession(): Promise<Session | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    if (!data.session || !data.session.user) return null;
    return toSession(data.session, data.session.user);
  }

  /**
   * Per ADR-0006: links a Google identity to the currently signed-in User
   * with the Calendar read-only scope, forcing offline access + consent
   * prompt so Supabase Auth gets a refresh token back. Returns the
   * Google OAuth URL — the caller is responsible for navigating to it
   * (web: `window.location.href = url`; native: in-app browser).
   *
   * After the callback returns, `getSessionWithProviderTokens()` will
   * return the new access_token + refresh_token, which OnboardingScreen
   * then persists via UserProviderTokensClient.
   */
  async linkGoogleCalendar(redirectTo: string): Promise<{ url: string }> {
    return this.linkGoogleWithScopes(redirectTo, GOOGLE_CALENDAR_SCOPES);
  }

  /**
   * Links Google with Calendar + Gmail scopes so the User can read and send
   * mail for Contacts on the relationship detail page. Includes the Calendar
   * scope so re-consent does not drop an existing Calendar connection.
   */
  async linkGoogleGmail(redirectTo: string): Promise<{ url: string }> {
    return this.linkGoogleWithScopes(redirectTo, GOOGLE_INTEGRATION_SCOPES);
  }

  /**
   * Builds the Instagram Login OAuth URL for a creator/professional account.
   * Token exchange happens in the instagram-oauth Edge Function on callback.
   */
  buildInstagramOAuthUrl(input: {
    appId: string;
    redirectUri: string;
  }): string {
    const params = new URLSearchParams({
      client_id: input.appId,
      redirect_uri: input.redirectUri,
      response_type: "code",
      scope: INSTAGRAM_INTEGRATION_SCOPES,
    });
    return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
  }

  /**
   * Builds the X OAuth 2.0 PKCE authorization URL. The caller must generate
   * code_verifier/code_challenge (see xPkce) and store the verifier for the
   * callback exchange in x-oauth.
   */
  buildXOAuthUrl(input: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    state: string;
  }): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      scope: X_INTEGRATION_SCOPES,
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256",
    });
    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Builds the Meta OAuth URL for WhatsApp Business Cloud API connect.
   * Token exchange happens in the whatsapp-oauth Edge Function on callback.
   */
  buildWhatsAppOAuthUrl(input: {
    appId: string;
    redirectUri: string;
    state: string;
  }): string {
    const params = new URLSearchParams({
      client_id: input.appId,
      redirect_uri: input.redirectUri,
      response_type: "code",
      scope: WHATSAPP_INTEGRATION_SCOPES,
      state: input.state,
    });
    return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  }

  /**
   * Builds the TikTok Login Kit OAuth URL. Token exchange happens in the
   * tiktok-oauth Edge Function on callback.
   */
  buildTikTokOAuthUrl(input: {
    clientKey: string;
    redirectUri: string;
    state: string;
  }): string {
    const params = new URLSearchParams({
      client_key: input.clientKey,
      redirect_uri: input.redirectUri,
      response_type: "code",
      scope: TIKTOK_INTEGRATION_SCOPES,
      state: input.state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
  }

  /**
   * Builds the Microsoft OAuth 2.0 PKCE authorization URL for Outlook
   * Calendar. Token exchange happens in the outlook-oauth Edge Function.
   */
  buildOutlookOAuthUrl(input: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    state: string;
  }): string {
    const params = new URLSearchParams({
      client_id: input.clientId,
      response_type: "code",
      redirect_uri: input.redirectUri,
      response_mode: "query",
      scope: OUTLOOK_INTEGRATION_SCOPES,
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256",
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  private async linkGoogleWithScopes(
    redirectTo: string,
    scopes: string,
  ): Promise<{ url: string }> {
    const { data, error } = await this.client.auth.linkIdentity({
      provider: "google",
      options: {
        scopes,
        redirectTo,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
    if (error) throw error;
    if (!data?.url) {
      throw new Error("linkIdentity returned no OAuth URL");
    }
    return { url: data.url };
  }

  /**
   * Exposes OAuth provider tokens off the current session. These are only
   * populated immediately after returning from an OAuth callback — once
   * read and persisted, subsequent calls return providerToken=null.
   */
  async getSessionWithProviderTokens(): Promise<SessionWithProviderTokens | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    const session = data?.session as
      | (SbSession & {
          provider_token?: string | null;
          provider_refresh_token?: string | null;
        })
      | null
      | undefined;
    if (!session) return null;
    return {
      accessToken: session.access_token,
      providerToken: session.provider_token ?? null,
      providerRefreshToken: session.provider_refresh_token ?? null,
      expiresAt: session.expires_at ?? null,
    };
  }

  onAuthStateChange(cb: (s: Session | null) => void): Unsubscribe {
    const { data } = this.client.auth.onAuthStateChange((_event, sbSession) => {
      if (!sbSession || !sbSession.user) {
        cb(null);
      } else {
        cb(toSession(sbSession, sbSession.user));
      }
    });
    return () => data.subscription.unsubscribe();
  }
}
