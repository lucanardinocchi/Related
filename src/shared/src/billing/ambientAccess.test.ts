import {
  AMBIENT_TRIAL_DAYS,
  canEnableAmbientIntelligence,
  canRunAmbientIntelligence,
  getAmbientTrialDaysRemaining,
  getAmbientTrialEndsAt,
  hasAmbientIntelligenceAccess,
  isAmbientIntelligenceEnabled,
  isAmbientPassMode,
  isWithinAmbientTrial,
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

describe("ambient trial", () => {
  const createdAt = "2026-05-01T12:00:00.000Z";

  it("is active within the trial window", () => {
    const now = new Date("2026-05-05T12:00:00.000Z");
    expect(isWithinAmbientTrial(createdAt, now)).toBe(true);
    expect(
      hasAmbientIntelligenceAccess(
        { status: "inactive" },
        { accountCreatedAt: new Date().toISOString() },
      ),
    ).toBe(true);
  });

  it("expires after the trial window", () => {
    const now = new Date("2026-05-09T12:00:01.000Z");
    expect(isWithinAmbientTrial(createdAt, now)).toBe(false);
    expect(
      hasAmbientIntelligenceAccess({ status: "inactive" }, { accountCreatedAt: createdAt }),
    ).toBe(false);
  });

  it("computes trial end from account creation", () => {
    expect(getAmbientTrialEndsAt(createdAt).toISOString()).toBe(
      new Date(
        new Date(createdAt).getTime() + AMBIENT_TRIAL_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString(),
    );
  });

  it("counts whole days remaining in the trial", () => {
    const now = new Date("2026-05-05T12:00:00.000Z");
    expect(getAmbientTrialDaysRemaining(createdAt, now)).toBeGreaterThan(0);
    expect(getAmbientTrialDaysRemaining(createdAt, now)).toBeLessThanOrEqual(
      AMBIENT_TRIAL_DAYS,
    );
  });
});

describe("canRunAmbientIntelligence", () => {
  it("allows active and trialing subscriptions", () => {
    expect(canRunAmbientIntelligence({ status: "active" })).toBe(true);
    expect(canRunAmbientIntelligence({ status: "trialing" })).toBe(true);
  });

  it("allows inactive users during the trial", () => {
    const createdAt = new Date().toISOString();
    expect(
      canRunAmbientIntelligence(
        { status: "inactive" },
        { accountCreatedAt: createdAt },
      ),
    ).toBe(true);
  });

  it("blocks inactive users after the trial", () => {
    const createdAt = "2020-01-01T00:00:00.000Z";
    expect(
      canRunAmbientIntelligence(
        { status: "inactive" },
        { accountCreatedAt: createdAt },
      ),
    ).toBe(false);
  });

  it("blocks users who turned Ambient Intelligence off", () => {
    expect(
      canRunAmbientIntelligence({ status: "active" }, { enabled: false }),
    ).toBe(false);
  });
});

describe("canEnableAmbientIntelligence", () => {
  it("allows enabling during trial without a subscription", () => {
    expect(
      canEnableAmbientIntelligence(
        { status: "inactive" },
        { accountCreatedAt: new Date().toISOString() },
      ),
    ).toBe(true);
  });

  it("requires a subscription after the trial", () => {
    expect(
      canEnableAmbientIntelligence(
        { status: "inactive" },
        { accountCreatedAt: "2020-01-01T00:00:00.000Z" },
      ),
    ).toBe(false);
  });
});
