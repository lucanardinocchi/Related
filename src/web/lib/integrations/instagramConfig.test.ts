import {
  assertInstagramAppIdConfigured,
  INSTAGRAM_APP_ID_MISCONFIG_MESSAGE,
  isInstagramAppIdMisconfigured,
} from "./instagramConfig";

describe("isInstagramAppIdMisconfigured", () => {
  it("returns false when ids differ", () => {
    expect(isInstagramAppIdMisconfigured("111", "222")).toBe(false);
  });

  it("returns true when instagram id matches whatsapp/facebook app id", () => {
    expect(isInstagramAppIdMisconfigured("1443359060811831", "1443359060811831")).toBe(
      true,
    );
  });

  it("returns false when either id is missing", () => {
    expect(isInstagramAppIdMisconfigured(null, "1443359060811831")).toBe(false);
    expect(isInstagramAppIdMisconfigured("111", null)).toBe(false);
  });
});

describe("assertInstagramAppIdConfigured", () => {
  it("throws when instagram app id matches whatsapp app id", () => {
    expect(() =>
      assertInstagramAppIdConfigured("1443359060811831", "1443359060811831"),
    ).toThrow(INSTAGRAM_APP_ID_MISCONFIG_MESSAGE);
  });

  it("passes when ids differ", () => {
    expect(() =>
      assertInstagramAppIdConfigured("111", "222"),
    ).not.toThrow();
  });
});
