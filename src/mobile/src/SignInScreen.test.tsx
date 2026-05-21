import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AuthClient } from "@related/shared";
import { SignInScreen } from "./SignInScreen";

type MockedAuthClient = {
  [K in keyof AuthClient]: jest.Mock;
};

const PASSWORD_RESET_REDIRECT =
  "http://127.0.0.1:3000/auth/callback?next=/reset-password";

function makeMockAuthClient(): MockedAuthClient {
  return {
    signUp: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    signInWithOAuth: jest.fn(),
    requestPasswordReset: jest.fn(),
    updatePassword: jest.fn(),
    getSession: jest.fn(),
    onAuthStateChange: jest.fn(),
    linkGoogleCalendar: jest.fn(),
    getSessionWithProviderTokens: jest.fn(),
  };
}

describe("<SignInScreen />", () => {
  it("renders email and password inputs and a sign-in button", () => {
    const authClient = makeMockAuthClient();
    render(
      <SignInScreen
        authClient={authClient as unknown as AuthClient}
        onSignedIn={jest.fn()}
        passwordResetRedirectTo={PASSWORD_RESET_REDIRECT}
        onOAuthSignIn={jest.fn()}
      />,
    );

    expect(screen.getByPlaceholderText(/email/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/password/i)).toBeTruthy();
    expect(screen.getByText(/sign in/i)).toBeTruthy();
  });

  it("calls authClient.signIn with the typed values and notifies the caller on success", async () => {
    const authClient = makeMockAuthClient();
    authClient.signIn.mockResolvedValue({
      access_token: "tkn",
      user: { id: "u1", email: "alice@anywhere.com" },
    });
    const onSignedIn = jest.fn();

    render(
      <SignInScreen
        authClient={authClient as unknown as AuthClient}
        onSignedIn={onSignedIn}
        passwordResetRedirectTo={PASSWORD_RESET_REDIRECT}
        onOAuthSignIn={jest.fn()}
      />,
    );
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "alice@anywhere.com");
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), "secret");
    fireEvent.press(screen.getByText(/sign in/i));

    await waitFor(() =>
      expect(authClient.signIn).toHaveBeenCalledWith("alice@anywhere.com", "secret"),
    );
    await waitFor(() =>
      expect(onSignedIn).toHaveBeenCalledWith({
        access_token: "tkn",
        user: { id: "u1", email: "alice@anywhere.com" },
      }),
    );
  });

  it("shows an error message when sign-in fails", async () => {
    const authClient = makeMockAuthClient();
    authClient.signIn.mockRejectedValue(new Error("Invalid login credentials"));
    const onSignedIn = jest.fn();

    render(
      <SignInScreen
        authClient={authClient as unknown as AuthClient}
        onSignedIn={onSignedIn}
        passwordResetRedirectTo={PASSWORD_RESET_REDIRECT}
        onOAuthSignIn={jest.fn()}
      />,
    );
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "alice@anywhere.com");
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), "wrong");
    fireEvent.press(screen.getByText(/sign in/i));

    expect(await screen.findByText(/invalid login credentials/i)).toBeTruthy();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("offers a toggle to switch between sign-in and sign-up modes", () => {
    const authClient = makeMockAuthClient();
    render(
      <SignInScreen
        authClient={authClient as unknown as AuthClient}
        onSignedIn={jest.fn()}
        passwordResetRedirectTo={PASSWORD_RESET_REDIRECT}
        onOAuthSignIn={jest.fn()}
      />,
    );

    // Default mode is sign-in; primary action says "Sign in", toggle offers sign-up.
    expect(screen.getByText(/^sign in$/i)).toBeTruthy();
    expect(screen.getByText(/new here\?/i)).toBeTruthy();

    // After tapping the toggle, the primary action switches to "Sign up".
    fireEvent.press(screen.getByText(/new here\?/i));
    expect(screen.getByText(/^sign up$/i)).toBeTruthy();
    expect(screen.getByText(/already have an account\?/i)).toBeTruthy();
  });

  it("calls authClient.signUp in sign-up mode and notifies the caller on success", async () => {
    const authClient = makeMockAuthClient();
    authClient.signUp.mockResolvedValue({
      access_token: "new-tkn",
      user: { id: "u-new", email: "newbie@elsewhere.com" },
    });
    const onSignedIn = jest.fn();

    render(
      <SignInScreen
        authClient={authClient as unknown as AuthClient}
        onSignedIn={onSignedIn}
        passwordResetRedirectTo={PASSWORD_RESET_REDIRECT}
        onOAuthSignIn={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByText(/new here\?/i));
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "newbie@elsewhere.com");
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), "strong-pw");
    fireEvent.press(screen.getByText(/^sign up$/i));

    await waitFor(() =>
      expect(authClient.signUp).toHaveBeenCalledWith(
        "newbie@elsewhere.com",
        "strong-pw",
      ),
    );
    await waitFor(() =>
      expect(onSignedIn).toHaveBeenCalledWith({
        access_token: "new-tkn",
        user: { id: "u-new", email: "newbie@elsewhere.com" },
      }),
    );
    expect(authClient.signIn).not.toHaveBeenCalled();
  });

  it("sends a password reset email in forgot-password mode", async () => {
    const authClient = makeMockAuthClient();
    authClient.requestPasswordReset.mockResolvedValue(undefined);

    render(
      <SignInScreen
        authClient={authClient as unknown as AuthClient}
        onSignedIn={jest.fn()}
        passwordResetRedirectTo={PASSWORD_RESET_REDIRECT}
        onOAuthSignIn={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByText(/forgot password\?/i));
    fireEvent.changeText(screen.getByPlaceholderText(/email/i), "alice@anywhere.com");
    fireEvent.press(screen.getByText(/send reset link/i));

    await waitFor(() =>
      expect(authClient.requestPasswordReset).toHaveBeenCalledWith(
        "alice@anywhere.com",
        PASSWORD_RESET_REDIRECT,
      ),
    );
    expect(
      await screen.findByText(/check your email for a link/i),
    ).toBeTruthy();
  });

  it("calls onOAuthSignIn when Continue with Google is pressed", async () => {
    const authClient = makeMockAuthClient();
    const onOAuthSignIn = jest.fn().mockResolvedValue(undefined);

    render(
      <SignInScreen
        authClient={authClient as unknown as AuthClient}
        onSignedIn={jest.fn()}
        passwordResetRedirectTo={PASSWORD_RESET_REDIRECT}
        onOAuthSignIn={onOAuthSignIn}
      />,
    );
    fireEvent.press(screen.getByText(/continue with google/i));

    await waitFor(() => expect(onOAuthSignIn).toHaveBeenCalledWith("google"));
  });
});
