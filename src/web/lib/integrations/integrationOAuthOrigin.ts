/**
 * Canonical browser origin for third-party OAuth redirect URIs.
 * Use NEXT_PUBLIC_APP_ORIGIN so redirect URIs match Azure/Meta registrations
 * (e.g. always http://127.0.0.1:3000, not localhost).
 */
export function getIntegrationOAuthOrigin(): string {
  if (typeof window === "undefined") return "";
  const configured = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return window.location.origin;
}

export function buildOutlookCallbackRedirectUri(origin?: string): string {
  const base = origin ?? getIntegrationOAuthOrigin();
  return `${base}/settings/outlook/callback`;
}
