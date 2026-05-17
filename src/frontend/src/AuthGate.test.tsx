import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { AuthClient, RelationshipsClient } from "@related/shared";
import { AuthGate } from "./AuthGate";

type MockedAuthClient = {
  [K in keyof AuthClient]: jest.Mock;
};

function makeMockAuthClient(): MockedAuthClient {
  return {
    signUp: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    getSession: jest.fn(),
    onAuthStateChange: jest.fn(() => () => {}),
  };
}

function makeMockRelationshipsClient(): RelationshipsClient {
  return {
    createContact: jest.fn(),
    // The authenticated AuthedApp lazy-loads the list on mount; tests that
    // assert sign-in flow shouldn't depend on the list resolving, but a
    // resolved-empty promise keeps them deterministic.
    listRelationships: jest.fn().mockResolvedValue([]),
    getRelationship: jest.fn(),
  } as unknown as RelationshipsClient;
}

describe("<AuthGate />", () => {
  it("shows the sign-in screen when no existing session is found", async () => {
    const authClient = makeMockAuthClient();
    authClient.getSession.mockResolvedValue(null);

    render(<AuthGate authClient={authClient as unknown as AuthClient} relationshipsClient={makeMockRelationshipsClient()} />);

    expect(await screen.findByPlaceholderText(/email/i)).toBeTruthy();
    expect(screen.queryByText(/^threads closed$/i)).toBeNull();
  });

  it("shows the Home screen when an existing session is found on load", async () => {
    const authClient = makeMockAuthClient();
    authClient.getSession.mockResolvedValue({
      access_token: "tkn",
      user: { id: "u", email: "a@b.com" },
    });

    render(<AuthGate authClient={authClient as unknown as AuthClient} relationshipsClient={makeMockRelationshipsClient()} />);

    expect(await screen.findByText(/^threads closed$/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/email/i)).toBeNull();
  });

  it("transitions from sign-in to Home after a successful sign-in", async () => {
    const authClient = makeMockAuthClient();
    authClient.getSession.mockResolvedValue(null);
    authClient.signIn.mockResolvedValue({
      access_token: "tkn",
      user: { id: "u", email: "a@b.com" },
    });

    render(<AuthGate authClient={authClient as unknown as AuthClient} relationshipsClient={makeMockRelationshipsClient()} />);
    fireEvent.changeText(await screen.findByPlaceholderText(/email/i), "a@b.com");
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), "secret");
    fireEvent.press(screen.getByText(/sign in/i));

    expect(await screen.findByText(/^threads closed$/i)).toBeTruthy();
  });

  it("returns to sign-in when the user taps the sign-out affordance on Home", async () => {
    const authClient = makeMockAuthClient();
    authClient.getSession.mockResolvedValue({
      access_token: "tkn",
      user: { id: "u", email: "a@b.com" },
    });
    let capturedCallback: ((s: null) => void) | undefined;
    authClient.onAuthStateChange.mockImplementation((cb: (s: null) => void) => {
      capturedCallback = cb;
      return () => {};
    });
    // Real Supabase fires the auth-state listener after signOut completes.
    authClient.signOut.mockImplementation(async () => {
      capturedCallback!(null);
    });

    render(<AuthGate authClient={authClient as unknown as AuthClient} relationshipsClient={makeMockRelationshipsClient()} />);
    expect(await screen.findByText(/^threads closed$/i)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText(/^sign out$/i));
    });

    expect(authClient.signOut).toHaveBeenCalled();
    expect(await screen.findByPlaceholderText(/email/i)).toBeTruthy();
  });

  it("subscribes to auth state changes and returns to sign-in on sign-out", async () => {
    const authClient = makeMockAuthClient();
    authClient.getSession.mockResolvedValue({
      access_token: "tkn",
      user: { id: "u", email: "a@b.com" },
    });
    let capturedCallback: ((s: null) => void) | undefined;
    authClient.onAuthStateChange.mockImplementation((cb: (s: null) => void) => {
      capturedCallback = cb;
      return () => {};
    });

    render(<AuthGate authClient={authClient as unknown as AuthClient} relationshipsClient={makeMockRelationshipsClient()} />);
    expect(await screen.findByText(/^threads closed$/i)).toBeTruthy();

    // Simulate sign-out coming from Supabase via the auth-state listener.
    await act(async () => {
      capturedCallback!(null);
    });

    expect(await screen.findByPlaceholderText(/email/i)).toBeTruthy();
  });
});
