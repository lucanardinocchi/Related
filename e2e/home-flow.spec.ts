import { expect, test, type Route } from "@playwright/test";

/**
 * Happy-path E2E for Slice 1: a new user signs up, lands on Home with empty
 * states, signs out, and returns to the sign-in surface.
 *
 * Supabase Auth HTTP endpoints are mocked at the browser network layer via
 * `page.route` — no real network calls, no rate limits, no shared test state.
 */
test.describe("Slice 1 happy path", () => {
  test("sign up → Home → sign out → sign in", async ({ page }) => {
    const mockUser = { id: "u-mock-1", email: "tdd@elsewhere.com" };
    const mockSession = {
      access_token: "mock-tkn",
      refresh_token: "mock-rtkn",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: mockUser,
    };

    // Mock Supabase Auth endpoints.
    await page.route("**/auth/v1/signup**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockSession),
      });
    });

    await page.route("**/auth/v1/token**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockSession),
      });
    });

    await page.route("**/auth/v1/logout**", async (route: Route) => {
      await route.fulfill({ status: 204, body: "" });
    });

    await page.route("**/auth/v1/user**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockUser),
      });
    });

    await page.goto("/");

    // Start on the sign-in surface (no session in memory).
    await expect(page.getByPlaceholder("Email")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();

    // Toggle to sign-up mode and submit.
    await page.getByText(/new here\?/i).click();
    await page.getByPlaceholder("Email").fill("tdd@elsewhere.com");
    await page.getByPlaceholder("Password").fill("strong-pw");
    await page.getByText(/^sign up$/i).click();

    // Land on Home with all four section regions visible.
    await expect(page.getByText(/threads closed/i)).toBeVisible();
    await expect(page.getByText(/open threads/i).first()).toBeVisible();
    await expect(page.getByText(/talk to claude/i)).toBeVisible();
    await expect(page.getByText(/^upcoming$/i)).toBeVisible();

    // Sign out via the affordance on Home.
    await page.getByText(/^sign out$/i).click();

    // Back to sign-in.
    await expect(page.getByPlaceholder("Email")).toBeVisible();
  });
});
