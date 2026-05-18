import {
  OnboardingClient,
  ONBOARDING_STEPS,
  type OnboardingState,
} from "./OnboardingClient";

describe("OnboardingClient.nextStep", () => {
  it("returns null when isFinished is true", () => {
    expect(
      OnboardingClient.nextStep({
        completedSteps: [],
        finishedAt: null,
        isFinished: true,
      }),
    ).toBeNull();
  });

  it("returns the first step when nothing is complete", () => {
    expect(
      OnboardingClient.nextStep({
        completedSteps: [],
        finishedAt: null,
        isFinished: false,
      }),
    ).toBe(ONBOARDING_STEPS[0]);
  });

  it("returns the first uncompleted step in canonical order", () => {
    expect(
      OnboardingClient.nextStep({
        completedSteps: ["welcome", "calendar"],
        finishedAt: null,
        isFinished: false,
      }),
    ).toBe("healthkit");
  });

  it("returns null when every canonical step has been completed", () => {
    const state: OnboardingState = {
      completedSteps: [...ONBOARDING_STEPS],
      finishedAt: null,
      isFinished: false,
    };
    expect(OnboardingClient.nextStep(state)).toBeNull();
  });
});
