export const OAUTH_RETURN_PATH_KEY = "related.oauth-return-path";
export const INTEGRATION_OAUTH_ERROR_KEY = "related.integration-oauth-error";

const DEFAULT_RETURN_PATH = "/settings";

export function stashIntegrationOAuthError(message: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(INTEGRATION_OAUTH_ERROR_KEY, message);
}

export function consumeIntegrationOAuthError(): string | null {
  if (typeof window === "undefined") return null;
  const message = sessionStorage.getItem(INTEGRATION_OAUTH_ERROR_KEY);
  if (message) sessionStorage.removeItem(INTEGRATION_OAUTH_ERROR_KEY);
  return message;
}

export function redirectToSettings(
  router: { replace: (path: string) => void },
  error?: string | null,
): void {
  if (error) stashIntegrationOAuthError(error);
  router.replace(DEFAULT_RETURN_PATH);
}

export function setOAuthReturnPath(path: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(OAUTH_RETURN_PATH_KEY, path);
}

export function getOAuthReturnPath(): string {
  if (typeof window === "undefined") return DEFAULT_RETURN_PATH;
  return sessionStorage.getItem(OAUTH_RETURN_PATH_KEY) ?? DEFAULT_RETURN_PATH;
}

export function clearOAuthReturnPath(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(OAUTH_RETURN_PATH_KEY);
}
