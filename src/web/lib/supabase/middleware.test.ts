import { describe, expect, it } from "vitest";
import { isOnboardingExempt } from "./middleware";

describe("isOnboardingExempt", () => {
  it("allows onboarding routes", () => {
    expect(isOnboardingExempt("/onboarding")).toBe(true);
    expect(isOnboardingExempt("/onboarding/step-2")).toBe(true);
  });

  it("allows context routes during incomplete onboarding", () => {
    expect(isOnboardingExempt("/context")).toBe(true);
    expect(isOnboardingExempt("/context/settings")).toBe(true);
  });

  it("allows OAuth callback paths under settings", () => {
    expect(isOnboardingExempt("/settings/google/callback")).toBe(true);
  });

  it("does not exempt other authed routes", () => {
    expect(isOnboardingExempt("/relationships")).toBe(false);
    expect(isOnboardingExempt("/")).toBe(false);
  });
});
