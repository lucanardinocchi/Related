import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearIntegrationOAuthFeedback } from "./oauthReturn";

describe("clearIntegrationOAuthFeedback", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/settings");
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("removes oauth_error and Microsoft error query params from the URL", () => {
    window.history.replaceState(
      {},
      "",
      "/settings?oauth_error=server%20issue&error=server_error&error_description=Application%20server%20issue",
    );
    sessionStorage.setItem("related.integration-oauth-error", "stale");

    clearIntegrationOAuthFeedback();

    expect(window.location.pathname).toBe("/settings");
    expect(window.location.search).toBe("");
    expect(sessionStorage.getItem("related.integration-oauth-error")).toBeNull();
  });
});
