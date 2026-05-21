import { isRecentlyCreatedAuthUser } from "./isRecentlyCreatedAuthUser";

describe("isRecentlyCreatedAuthUser", () => {
  it("returns true for accounts created within the default window", () => {
    const created = new Date(Date.now() - 60_000).toISOString();
    expect(isRecentlyCreatedAuthUser({ created_at: created })).toBe(true);
  });

  it("returns false for older accounts", () => {
    const created = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(isRecentlyCreatedAuthUser({ created_at: created })).toBe(false);
  });
});
