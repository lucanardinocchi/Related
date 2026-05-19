import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthClient } from "./AuthClient";

// Minimal mock for SupabaseClient — just the auth methods AuthClient calls.
type MockSupabase = {
  auth: {
    signUp: jest.Mock;
    signInWithPassword: jest.Mock;
    signOut: jest.Mock;
    getSession: jest.Mock;
    onAuthStateChange: jest.Mock;
    linkIdentity: jest.Mock;
  };
};

function makeMockSupabase(): MockSupabase {
  return {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      linkIdentity: jest.fn(),
    },
  };
}

function withMock(): { mock: MockSupabase; authClient: AuthClient } {
  const mock = makeMockSupabase();
  const authClient = new AuthClient(mock as unknown as SupabaseClient);
  return { mock, authClient };
}

describe("AuthClient.signUp", () => {
  it("creates a User and returns a Session with an access token", async () => {
    const { mock, authClient } = withMock();
    mock.auth.signUp.mockResolvedValue({
      data: {
        session: { access_token: "tkn-abc" },
        user: { id: "user-1", email: "alice@anywhere.com" },
      },
      error: null,
    });

    const session = await authClient.signUp("alice@anywhere.com", "password123456");

    expect(session.access_token).toBe("tkn-abc");
    expect(session.user.id).toBe("user-1");
    expect(session.user.email).toBe("alice@anywhere.com");
    expect(mock.auth.signUp).toHaveBeenCalledWith({
      email: "alice@anywhere.com",
      password: "password123456",
    });
  });
});

describe("AuthClient.signIn", () => {
  it("returns a Session for valid credentials", async () => {
    const { mock, authClient } = withMock();
    mock.auth.signInWithPassword.mockResolvedValue({
      data: {
        session: { access_token: "signed-in-tkn" },
        user: { id: "user-2", email: "bob@elsewhere.com" },
      },
      error: null,
    });

    const session = await authClient.signIn("bob@elsewhere.com", "correct-password");

    expect(session.access_token).toBe("signed-in-tkn");
    expect(session.user.email).toBe("bob@elsewhere.com");
    expect(mock.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "bob@elsewhere.com",
      password: "correct-password",
    });
  });

  it("throws when credentials are invalid", async () => {
    const { mock, authClient } = withMock();
    mock.auth.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { name: "AuthApiError", message: "Invalid login credentials" },
    });

    await expect(
      authClient.signIn("bob@elsewhere.com", "wrong-password"),
    ).rejects.toMatchObject({ message: "Invalid login credentials" });
  });
});

describe("AuthClient.signOut", () => {
  it("delegates to the Supabase client and resolves", async () => {
    const { mock, authClient } = withMock();
    mock.auth.signOut.mockResolvedValue({ error: null });

    await expect(authClient.signOut()).resolves.toBeUndefined();
    expect(mock.auth.signOut).toHaveBeenCalled();
  });

  it("throws when Supabase reports an error", async () => {
    const { mock, authClient } = withMock();
    mock.auth.signOut.mockResolvedValue({
      error: { name: "AuthApiError", message: "Network error" },
    });

    await expect(authClient.signOut()).rejects.toMatchObject({
      message: "Network error",
    });
  });
});

describe("AuthClient.getSession", () => {
  it("returns the current Session when one exists", async () => {
    const { mock, authClient } = withMock();
    mock.auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "current-tkn",
          user: { id: "u3", email: "carol@some.com" },
        },
      },
      error: null,
    });

    const session = await authClient.getSession();

    expect(session).not.toBeNull();
    expect(session!.access_token).toBe("current-tkn");
    expect(session!.user.email).toBe("carol@some.com");
  });

  it("returns null when no session exists", async () => {
    const { mock, authClient } = withMock();
    mock.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const session = await authClient.getSession();

    expect(session).toBeNull();
  });
});

describe("AuthClient.onAuthStateChange", () => {
  it("subscribes a callback and returns an unsubscribe function", () => {
    const { mock, authClient } = withMock();
    const fakeSubscription = { unsubscribe: jest.fn() };
    mock.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: fakeSubscription },
    });

    const callback = jest.fn();
    const unsubscribe = authClient.onAuthStateChange(callback);

    expect(mock.auth.onAuthStateChange).toHaveBeenCalled();
    expect(typeof unsubscribe).toBe("function");

    unsubscribe();
    expect(fakeSubscription.unsubscribe).toHaveBeenCalled();
  });

  it("invokes the callback with a translated Session when one is provided", () => {
    const { mock, authClient } = withMock();
    let captured: ((event: string, session: unknown) => void) | undefined;
    mock.auth.onAuthStateChange.mockImplementation((handler: typeof captured) => {
      captured = handler;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });

    const callback = jest.fn();
    authClient.onAuthStateChange(callback);
    captured!("SIGNED_IN", {
      access_token: "evt-tkn",
      user: { id: "u-evt", email: "dave@nowhere.com" },
    });

    expect(callback).toHaveBeenCalledWith({
      access_token: "evt-tkn",
      user: { id: "u-evt", email: "dave@nowhere.com" },
    });
  });

  it("invokes the callback with null on sign-out", () => {
    const { mock, authClient } = withMock();
    let captured: ((event: string, session: unknown) => void) | undefined;
    mock.auth.onAuthStateChange.mockImplementation((handler: typeof captured) => {
      captured = handler;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });

    const callback = jest.fn();
    authClient.onAuthStateChange(callback);
    captured!("SIGNED_OUT", null);

    expect(callback).toHaveBeenCalledWith(null);
  });
});

describe("AuthClient.linkGoogleCalendar", () => {
  it("calls Supabase linkIdentity with the calendar.readonly scope, offline access_type, and forced consent prompt", async () => {
    const { mock, authClient } = withMock();
    mock.auth.linkIdentity.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/auth?...&provider=google" },
      error: null,
    });

    const { url } = await authClient.linkGoogleCalendar(
      "https://app.example/onboarding-return",
    );

    expect(mock.auth.linkIdentity).toHaveBeenCalledWith({
      provider: "google",
      options: expect.objectContaining({
        scopes: "https://www.googleapis.com/auth/calendar.readonly",
        redirectTo: "https://app.example/onboarding-return",
        queryParams: expect.objectContaining({
          access_type: "offline",
          prompt: "consent",
        }),
      }),
    });
    expect(url).toMatch(/accounts\.google\.com/);
  });
});

describe("AuthClient.getSessionWithProviderTokens", () => {
  it("returns provider_token and refresh_token alongside the access token when the session has them", async () => {
    const { mock, authClient } = withMock();
    mock.auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "ses-1",
          provider_token: "ptkn-1",
          provider_refresh_token: "prtk-1",
          expires_at: 1747641600,
          user: { id: "u-1", email: "luca@example.com" },
        },
      },
      error: null,
    });

    const got = await authClient.getSessionWithProviderTokens();
    expect(got).toEqual({
      accessToken: "ses-1",
      providerToken: "ptkn-1",
      providerRefreshToken: "prtk-1",
      expiresAt: 1747641600,
    });
  });

  it("returns null when there is no session", async () => {
    const { mock, authClient } = withMock();
    mock.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const got = await authClient.getSessionWithProviderTokens();
    expect(got).toBeNull();
  });

  it("returns null provider tokens when the session has none (post-email-signin, pre-OAuth)", async () => {
    const { mock, authClient } = withMock();
    mock.auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "ses-1",
          user: { id: "u-1", email: "luca@example.com" },
        },
      },
      error: null,
    });
    const got = await authClient.getSessionWithProviderTokens();
    expect(got).toEqual({
      accessToken: "ses-1",
      providerToken: null,
      providerRefreshToken: null,
      expiresAt: null,
    });
  });
});
