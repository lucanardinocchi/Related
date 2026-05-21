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

describe("OnboardingClient.finishOnboarding", () => {
  it("marks every canonical step complete and sets isFinished", async () => {
    const upsert = jest.fn().mockResolvedValue({
      data: {
        completed_steps: [...ONBOARDING_STEPS],
        finished_at: "2026-05-21T00:00:00.000Z",
      },
      error: null,
    });
    const resolveOwnerId = jest.fn().mockResolvedValue("user-1");
    const client = {
      from: jest.fn().mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: upsert,
          }),
        }),
      }),
    };

    const onboarding = new OnboardingClient(
      client as never,
      resolveOwnerId,
    );
    const result = await onboarding.finishOnboarding();

    expect(result.isFinished).toBe(true);
    expect(result.completedSteps).toEqual(ONBOARDING_STEPS);
    expect(result.finishedAt).toBe("2026-05-21T00:00:00.000Z");
  });
});
