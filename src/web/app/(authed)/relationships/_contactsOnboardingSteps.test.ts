import { describe, expect, it } from "vitest";
import {
  FRIENDS_ONBOARDING_TARGET,
  resolveContactsOnboardingStep,
} from "./_contactsOnboardingSteps";

describe("resolveContactsOnboardingStep", () => {
  it("returns first step with no friends added", () => {
    expect(resolveContactsOnboardingStep(0, false)?.id).toBe("first");
  });

  it("returns second step after one friend", () => {
    expect(resolveContactsOnboardingStep(1, false)?.id).toBe("second");
  });

  it("returns family step after two friends when family not complete", () => {
    expect(resolveContactsOnboardingStep(2, false)?.id).toBe("family");
  });

  it("returns third step after family is complete", () => {
    expect(resolveContactsOnboardingStep(2, true)?.id).toBe("third");
  });

  it("progresses through remaining friend milestones", () => {
    expect(resolveContactsOnboardingStep(3, true)?.id).toBe("fourth");
    expect(resolveContactsOnboardingStep(4, true)?.id).toBe("fifth");
  });

  it("returns null when onboarding is complete", () => {
    expect(
      resolveContactsOnboardingStep(FRIENDS_ONBOARDING_TARGET, true),
    ).toBeNull();
  });
});
