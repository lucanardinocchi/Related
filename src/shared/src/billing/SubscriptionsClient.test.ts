import {
  isActiveSubscriptionStatus,
  ACTIVE_SUBSCRIPTION_STATUSES,
} from "./SubscriptionsClient";

describe("isActiveSubscriptionStatus", () => {
  it("treats active and trialing as subscribed", () => {
    for (const status of ACTIVE_SUBSCRIPTION_STATUSES) {
      expect(isActiveSubscriptionStatus(status)).toBe(true);
    }
  });

  it("treats inactive and canceled as not subscribed", () => {
    expect(isActiveSubscriptionStatus("inactive")).toBe(false);
    expect(isActiveSubscriptionStatus("canceled")).toBe(false);
    expect(isActiveSubscriptionStatus("past_due")).toBe(false);
    expect(isActiveSubscriptionStatus(null)).toBe(false);
    expect(isActiveSubscriptionStatus(undefined)).toBe(false);
  });
});
