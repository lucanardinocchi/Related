import { expect, test } from "@playwright/test";

/**
 * Post-ADR-0008 smoke tests for the Next.js web surface. These do not
 * authenticate (Supabase auth is mocked-out in the legacy specs and the
 * new routes are server components that redirect unauthenticated
 * requests) — instead they assert:
 *
 *   1. /  redirects to /sign-in for unauthenticated requests
 *   2. /relationships also redirects to /sign-in (the authed route gate)
 *   3. The sign-in page renders with the new design system tokens applied
 *      (Outfit font variable on <html>)
 *   4. /talk → /agent redirect chain reaches the sign-in page (since
 *      /agent is itself behind the auth gate)
 *
 * Deeper, signed-in surface tests are deferred to a follow-up that wires
 * a stable Supabase auth fixture into the dev server.
 */
test.describe("web smoke (post ADR-0008)", () => {
  test("/ redirects unauthenticated User to /sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("/relationships redirects unauthenticated User to /sign-in", async ({ page }) => {
    await page.goto("/relationships");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("/calendar redirects unauthenticated User to /sign-in", async ({ page }) => {
    await page.goto("/calendar");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("/commitments redirects unauthenticated User to /sign-in", async ({ page }) => {
    await page.goto("/commitments");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("/agent redirects unauthenticated User to /sign-in", async ({ page }) => {
    await page.goto("/agent");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("/talk redirects to /agent (which then redirects to /sign-in)", async ({ page }) => {
    await page.goto("/talk");
    // The /talk page redirects to /agent; /agent then redirects to /sign-in
    // because no session cookie is present. We assert the final URL.
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("sign-in page renders and loads the Outfit font variable on <html>", async ({ page }) => {
    await page.goto("/sign-in");
    const htmlClass = await page.locator("html").getAttribute("class");
    expect(htmlClass ?? "").toContain("--font-outfit");
  });
});
