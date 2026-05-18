import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { OnboardingClient, OnboardingState } from "@related/shared";
import { OnboardingScreen } from "./OnboardingScreen";

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
    render(<OnboardingScreen onboardingClient={client} onFinished={jest.fn()} />);

    // Should land on HealthKit (3rd step) — not Welcome.
    await screen.findByText("HealthKit (iOS)");
    expect(screen.queryByText(/welcome to related/i)).toBeNull();
  });
});
