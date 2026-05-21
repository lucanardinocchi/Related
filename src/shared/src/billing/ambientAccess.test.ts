import {
  canRunAmbientIntelligence,
  isAmbientPassMode,
} from "./ambientAccess";

describe("isAmbientPassMode", () => {
  it("includes baseline and triggered only", () => {
    expect(isAmbientPassMode("baseline")).toBe(true);
    expect(isAmbientPassMode("triggered")).toBe(true);
    expect(isAmbientPassMode("engaged")).toBe(false);
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
});
