import { describe, expect, it } from "vitest";
import { isIntegrationOAuthCallbackPath } from "./integrationOAuthStorage";

describe("isIntegrationOAuthCallbackPath", () => {
  it("matches third-party integration OAuth callbacks", () => {
    expect(isIntegrationOAuthCallbackPath("/settings/outlook/callback")).toBe(
      true,
    );
    expect(isIntegrationOAuthCallbackPath("/settings/x/callback")).toBe(true);
  });

  it("does not match normal authed routes", () => {
    expect(isIntegrationOAuthCallbackPath("/settings")).toBe(false);
    expect(isIntegrationOAuthCallbackPath("/auth/callback")).toBe(false);
  });
});
