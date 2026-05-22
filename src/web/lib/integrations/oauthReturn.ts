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

export function consumeIntegrationOAuthQueryFeedback(): {
  error: string | null;
  success: string | null;
} {
  if (typeof window === "undefined") {
    return { error: null, success: null };
  }

  const params = new URLSearchParams(window.location.search);
  const error = params.get("oauth_error");
  const success = params.get("oauth_success");
  if (!error && !success) {
    return { error: null, success: null };
  }

  const path = window.location.pathname;
  window.history.replaceState({}, "", path);
  return { error, success };
}

export function redirectToSettings(
  router: { replace: (path: string) => void },
  error?: string | null,
  options?: { success?: string; hard?: boolean },
): void {
  const returnPath = getOAuthReturnPath();
  const params = new URLSearchParams();
  if (error) {
    stashIntegrationOAuthError(error);
    params.set("oauth_error", error);
  } else if (options?.success) {
    params.set("oauth_success", options.success);
  }
  const query = params.toString();
  const destination = query ? `${returnPath}?${query}` : returnPath;

  if (options?.hard) {
    window.location.replace(destination);
    return;
  }
  router.replace(destination);
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
