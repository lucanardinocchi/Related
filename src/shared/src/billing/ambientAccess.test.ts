import {
  canRunAmbientIntelligence,
  isAmbientIntelligenceEnabled,
  isAmbientPassMode,
} from "./ambientAccess";

describe("isAmbientPassMode", () => {
  it("includes baseline and triggered only", () => {
    expect(isAmbientPassMode("baseline")).toBe(true);
    expect(isAmbientPassMode("triggered")).toBe(true);
  });
});

describe("isAmbientIntelligenceEnabled", () => {
  it("defaults to enabled when unset", () => {
    expect(isAmbientIntelligenceEnabled(null)).toBe(true);
    expect(isAmbientIntelligenceEnabled(undefined)).toBe(true);
  });

  it("respects stored preference", () => {
    expect(isAmbientIntelligenceEnabled({ enabled: false })).toBe(false);
    expect(isAmbientIntelligenceEnabled({ enabled: true })).toBe(true);
  });
});

describe("canRunAmbientIntelligence", () => {
  it("allows active and trialing subscriptions", () => {
    expect(canRunAmbientIntelligence({ status: "active" })).toBe(true);
    expect(canRunAmbientIntelligence({ status: "trialing" })).toBe(true);
  });

  it("blocks inactive users", () => {
    expect(canRunAmbientIntelligence({ status: "inactive" })).toBe(false);
    expect(canRunAmbientIntelligence({ status: "canceled" })).toBe(false);
  });

  it("blocks users who turned Ambient Intelligence off", () => {
    expect(
      canRunAmbientIntelligence({ status: "active" }, { enabled: false }),
    ).toBe(false);
  });
});
