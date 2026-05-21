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

function toSession(sbSession: SbSession, sbUser: SbUser): Session {
  if (!sbUser.email) {
    throw new Error("Supabase user is missing an email address.");
  }
  return {
    access_token: sbSession.access_token,
    user: { id: sbUser.id, email: sbUser.email },
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
