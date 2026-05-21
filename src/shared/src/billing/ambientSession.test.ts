import {
  AMBIENT_BILLING_MODAL_SESSION_KEY,
  hasShownAmbientBillingModalThisSession,
  markAmbientBillingModalShownThisSession,
} from "./ambientSession";

describe("ambientSession", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("marks and reads modal shown state within the session", () => {
    expect(hasShownAmbientBillingModalThisSession()).toBe(false);
    markAmbientBillingModalShownThisSession();
    expect(hasShownAmbientBillingModalThisSession()).toBe(true);
    expect(sessionStorage.getItem(AMBIENT_BILLING_MODAL_SESSION_KEY)).toBe("1");
  });
});
