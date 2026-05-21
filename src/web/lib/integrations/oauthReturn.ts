export const OAUTH_RETURN_PATH_KEY = "related.oauth-return-path";

const DEFAULT_RETURN_PATH = "/settings";

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
