/** Status values returned by integration Edge Functions when OAuth refresh fails. */
export type IntegrationNeedsReconsentStatus = "needs_reconsent";

export function isNeedsReconsent(
  status: string | undefined | null,
): status is IntegrationNeedsReconsentStatus {
  return status === "needs_reconsent";
}

/** User-facing error when an integration call returns needs_reconsent. */
export function integrationReconsentError(integrationLabel: string): Error {
  return new Error(
    `Your ${integrationLabel} connection expired. Reconnect in Settings → Integrations.`,
  );
}

/** Throws when status is needs_reconsent; no-op otherwise. */
export function assertIntegrationOk(
  status: string | undefined,
  integrationLabel: string,
): void {
  if (isNeedsReconsent(status)) {
    throw integrationReconsentError(integrationLabel);
  }
}
