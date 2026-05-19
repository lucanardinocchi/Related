import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type {
  AuthClient,
  OnboardingClient,
  OnboardingState,
  UserProviderTokensClient,
} from "@related/shared";
import { OnboardingScreen } from "./OnboardingScreen";

// react-native's jest preset reports Platform.OS = 'ios' by default.
// Tests that don't care about the HealthKit branch deliberately
// `requestHealthKit={undefined}` to take the Skip path (mirrors web /
// Android in production).

function makeAuthMock(): jest.Mocked<AuthClient> {
  return {
    linkGoogleCalendar: jest.fn(),
    getSessionWithProviderTokens: jest
      .fn()
      .mockResolvedValue({
        accessToken: "ses",
        providerToken: null,
        providerRefreshToken: null,
        expiresAt: null,
      }),
  } as unknown as jest.Mocked<AuthClient>;
}

function makeTokensMock(): jest.Mocked<UserProviderTokensClient> {
  return {
    upsert: jest.fn().mockResolvedValue(undefined),
    getForProvider: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<UserProviderTokensClient>;
}

function makeMock(initial: OnboardingState): jest.Mocked<OnboardingClient> {
  let state = initial;
  return {
    getState: jest.fn().mockResolvedValue(state),
    startIfNeeded: jest.fn().mockImplementation(async () => state),
    completeStep: jest.fn().mockImplementation(async (step) => {
      const completedSteps = Array.from(new Set([...state.completedSteps, step]));
      state = {
        ...state,
        completedSteps,
        finishedAt: completedSteps.length >= 7 ? new Date().toISOString() : null,
        isFinished: completedSteps.length >= 7,
      };
      return state;
    }),
  } as unknown as jest.Mocked<OnboardingClient>;
}

describe("<OnboardingScreen />", () => {
  it("starts on Welcome and walks through every step on tap-through", async () => {
    const client = makeMock({
      completedSteps: [],
      finishedAt: null,
      isFinished: false,
    });
    const onFinished = jest.fn();

    render(
      <OnboardingScreen
        onboardingClient={client}
        authClient={makeAuthMock()}
        userProviderTokensClient={makeTokensMock()}
        oauthRedirectTo="https://app.example/onboarding"
        navigate={jest.fn()}
        onFinished={onFinished}
      />,
    );

    // Welcome
    await screen.findByText(/welcome to related/i);
    fireEvent.press(screen.getByText(/continue/i));

    // Calendar (deferred — render Skip). The deferred note ALSO contains
    // "Skip" in its prose, so match exactly the button label instead.
    await screen.findByText(/calendar permission/i);
    fireEvent.press(screen.getByText("Skip"));

    // HealthKit — match the exact title since "HealthKit" also appears in body.
    await screen.findByText("HealthKit (iOS)");
    fireEvent.press(screen.getByText("Skip"));

    // Notifications
    await screen.findByText(/^notifications$/i);
    fireEvent.press(screen.getByText("Skip"));

    // Contacts
    await screen.findByText(/first contacts/i);
    fireEvent.press(screen.getByText(/^skip — i'?ll add them later$/i));

    // Goals
    await screen.findByText(/goals & values/i);
    fireEvent.press(screen.getByText("Skip"));

    // Done — render "Talk to Claude" CTA (body also mentions it; press the
    // button, which is rendered after the title).
    await screen.findByText(/all set/i);
    const ctas = screen.getAllByText(/talk to claude/i);
    fireEvent.press(ctas[ctas.length - 1]);

    await waitFor(() => expect(onFinished).toHaveBeenCalled());
    expect(client.completeStep).toHaveBeenCalledTimes(7);
  });

  it("resumes at the next un-completed step when state is partial", async () => {
    const client = makeMock({
      completedSteps: ["welcome", "calendar"],
      finishedAt: null,
      isFinished: false,
    });
    render(
      <OnboardingScreen
        onboardingClient={client}
        authClient={makeAuthMock()}
        userProviderTokensClient={makeTokensMock()}
        oauthRedirectTo="https://app.example/onboarding"
        navigate={jest.fn()}
        onFinished={jest.fn()}
      />,
    );

    // Should land on HealthKit (3rd step) — not Welcome.
    await screen.findByText("HealthKit (iOS)");
    expect(screen.queryByText(/welcome to related/i)).toBeNull();
  });

  it("Calendar step: tapping 'Connect calendar' fetches the OAuth URL and navigates to it", async () => {
    const client = makeMock({
      completedSteps: ["welcome"],
      finishedAt: null,
      isFinished: false,
    });
    const authClient = makeAuthMock();
    authClient.linkGoogleCalendar.mockResolvedValue({
      url: "https://accounts.google.com/o/oauth2/auth?…",
    });
    const navigate = jest.fn();

    render(
      <OnboardingScreen
        onboardingClient={client}
        authClient={authClient}
        userProviderTokensClient={makeTokensMock()}
        oauthRedirectTo="https://app.example/onboarding"
        navigate={navigate}
        onFinished={jest.fn()}
      />,
    );

    await screen.findByText(/calendar permission/i);
    fireEvent.press(screen.getByText("Connect calendar"));

    await waitFor(() => {
      expect(authClient.linkGoogleCalendar).toHaveBeenCalledWith(
        "https://app.example/onboarding",
      );
    });
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(
        "https://accounts.google.com/o/oauth2/auth?…",
      );
    });
  });

  it("On mount: if the session has a fresh provider_token (post-OAuth return), persists it and advances the calendar step", async () => {
    const client = makeMock({
      completedSteps: ["welcome"],
      finishedAt: null,
      isFinished: false,
    });
    const authClient = makeAuthMock();
    authClient.getSessionWithProviderTokens.mockResolvedValue({
      accessToken: "ses-1",
      providerToken: "ptkn-1",
      providerRefreshToken: "prtk-1",
      expiresAt: 1747641600,
    });
    const tokens = makeTokensMock();

    render(
      <OnboardingScreen
        onboardingClient={client}
        authClient={authClient}
        userProviderTokensClient={tokens}
        oauthRedirectTo="https://app.example/onboarding"
        navigate={jest.fn()}
        onFinished={jest.fn()}
      />,
    );

    // Token is persisted with the Google provider name + scopes.
    await waitFor(() => {
      expect(tokens.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
          accessToken: "ptkn-1",
          refreshToken: "prtk-1",
        }),
      );
    });
    // Calendar step auto-completes; UI advances to HealthKit.
    await waitFor(() => {
      expect(client.completeStep).toHaveBeenCalledWith("calendar");
    });
  });

  it("HealthKit step: when `requestHealthKit` is undefined (web/Android), shows Skip with 'iOS only in v1' note", async () => {
    const client = makeMock({
      completedSteps: ["welcome", "calendar"],
      finishedAt: null,
      isFinished: false,
    });

    render(
      <OnboardingScreen
        onboardingClient={client}
        authClient={makeAuthMock()}
        userProviderTokensClient={makeTokensMock()}
        oauthRedirectTo="https://app.example/onboarding"
        navigate={jest.fn()}
        onFinished={jest.fn()}
      />,
    );

    await screen.findByText("HealthKit (iOS)");
    // Hint that this is platform-degraded.
    expect(screen.getByText(/iOS only in v1/i)).toBeTruthy();
    // Skip button advances the step.
    fireEvent.press(screen.getByText("Skip"));
    await waitFor(() => {
      expect(client.completeStep).toHaveBeenCalledWith("healthkit");
    });
  });

  it("HealthKit step: when `requestHealthKit` is provided (iOS), tapping Connect calls the request and advances on grant", async () => {
    const client = makeMock({
      completedSteps: ["welcome", "calendar"],
      finishedAt: null,
      isFinished: false,
    });
    const requestHealthKit = jest.fn().mockResolvedValue({ granted: true });

    render(
      <OnboardingScreen
        onboardingClient={client}
        authClient={makeAuthMock()}
        userProviderTokensClient={makeTokensMock()}
        oauthRedirectTo="https://app.example/onboarding"
        navigate={jest.fn()}
        onFinished={jest.fn()}
        requestHealthKit={requestHealthKit}
      />,
    );

    await screen.findByText("HealthKit (iOS)");
    // No deferred / web-fallback note when the request is available.
    expect(screen.queryByText(/iOS only in v1/i)).toBeNull();
    fireEvent.press(screen.getByText("Connect HealthKit"));

    await waitFor(() => {
      expect(requestHealthKit).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(client.completeStep).toHaveBeenCalledWith("healthkit");
    });
  });

  it("HealthKit step: on iOS denial, still advances the step (degraded but non-blocking)", async () => {
    const client = makeMock({
      completedSteps: ["welcome", "calendar"],
      finishedAt: null,
      isFinished: false,
    });
    const requestHealthKit = jest.fn().mockResolvedValue({ granted: false });

    render(
      <OnboardingScreen
        onboardingClient={client}
        authClient={makeAuthMock()}
        userProviderTokensClient={makeTokensMock()}
        oauthRedirectTo="https://app.example/onboarding"
        navigate={jest.fn()}
        onFinished={jest.fn()}
        requestHealthKit={requestHealthKit}
      />,
    );

    await screen.findByText("HealthKit (iOS)");
    fireEvent.press(screen.getByText("Connect HealthKit"));

    await waitFor(() => {
      expect(requestHealthKit).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(client.completeStep).toHaveBeenCalledWith("healthkit");
    });
  });

  it("On mount: if the session has no provider_token (fresh email sign-in), does NOT auto-advance the calendar step", async () => {
    const client = makeMock({
      completedSteps: ["welcome"],
      finishedAt: null,
      isFinished: false,
    });
    const authClient = makeAuthMock();
    // default mock returns providerToken: null already
    const tokens = makeTokensMock();

    render(
      <OnboardingScreen
        onboardingClient={client}
        authClient={authClient}
        userProviderTokensClient={tokens}
        oauthRedirectTo="https://app.example/onboarding"
        navigate={jest.fn()}
        onFinished={jest.fn()}
      />,
    );

    await screen.findByText(/calendar permission/i);
    // No upsert because no token to write.
    expect(tokens.upsert).not.toHaveBeenCalled();
    // No completeStep('calendar') because we waited for the User.
    expect(client.completeStep).not.toHaveBeenCalled();
  });
});
