import {
  createClient,
  SupabaseClient,
  User as SbUser,
  Session as SbSession,
} from "@supabase/supabase-js";

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
