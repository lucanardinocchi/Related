/** sessionStorage key — modal shown at most once per browser tab session. */
export const AMBIENT_BILLING_MODAL_SESSION_KEY =
  "related.ambient-billing-modal-shown";

export function hasShownAmbientBillingModalThisSession(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(AMBIENT_BILLING_MODAL_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function markAmbientBillingModalShownThisSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(AMBIENT_BILLING_MODAL_SESSION_KEY, "1");
  } catch {
    // Private mode / quota — caller should also keep an in-memory flag.
  }
}
