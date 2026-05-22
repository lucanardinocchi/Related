import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildOutlookCallbackRedirectUri,
  getIntegrationOAuthOrigin,
} from "./integrationOAuthOrigin";

describe("integrationOAuthOrigin", () => {
  const originalOrigin = "http://localhost:3000";

  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { origin: originalOrigin },
    });
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("prefers NEXT_PUBLIC_APP_ORIGIN over window.location.origin", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ORIGIN", "http://127.0.0.1:3000");
    expect(getIntegrationOAuthOrigin()).toBe("http://127.0.0.1:3000");
  });

  it("builds outlook callback redirect from canonical origin", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ORIGIN", "http://127.0.0.1:3000");
    expect(buildOutlookCallbackRedirectUri()).toBe(
      "http://127.0.0.1:3000/settings/outlook/callback",
    );
  });
});
