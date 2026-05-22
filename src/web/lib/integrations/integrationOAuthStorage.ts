/** Ephemeral OAuth values (PKCE verifier, state) for third-party integrations. */

const DEFAULT_MAX_AGE_SECONDS = 600;

function cookieFlags(): string {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  return `; path=/; max-age=${DEFAULT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

export function setIntegrationOAuthValue(key: string, value: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(key, value);
  document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}${cookieFlags()}`;
}

export function getIntegrationOAuthValue(key: string): string | null {
  if (typeof window === "undefined") return null;

  const fromSession = sessionStorage.getItem(key);
  if (fromSession) return fromSession;

  const prefix = `${encodeURIComponent(key)}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

export function clearIntegrationOAuthValue(key: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(key);
  document.cookie = `${encodeURIComponent(key)}=; path=/; max-age=0`;
}

export function isIntegrationOAuthCallbackPath(pathname: string): boolean {
  return pathname.startsWith("/settings/") && pathname.endsWith("/callback");
}
