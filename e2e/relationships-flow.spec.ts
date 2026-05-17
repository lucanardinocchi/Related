import { expect, test, type Route } from "@playwright/test";

/**
 * Slice 2 happy path: a signed-in user adds a Contact, sees the
 * auto-created Relationship in the All Relationships list, and drills
 * into its stub detail view.
 *
 * Both Supabase Auth and Supabase REST (contacts + relationships) are
 * mocked at the browser network layer — no real DB.
 */
test.describe("Slice 2 happy path", () => {
  test("sign in → Relationships → Add Contact → list → detail", async ({
    page,
  }) => {
    const mockUser = { id: "u-mock-1", email: "tdd@elsewhere.com" };
    const mockSession = {
      access_token: "mock-tkn",
      refresh_token: "mock-rtkn",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: mockUser,
    };

    // In-memory backing store. POST appends; GET returns the list.
    type StoredContact = {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      created_at: string;
    };
    type StoredRelationship = {
      id: string;
      target_type: "contact";
      created_at: string;
      contact: StoredContact;
    };
    const relationships: StoredRelationship[] = [];

    await page.route("**/auth/v1/signup**", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockSession),
      }),
    );
    await page.route("**/auth/v1/token**", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockSession),
      }),
    );
    await page.route("**/auth/v1/logout**", (route: Route) =>
      route.fulfill({ status: 204, body: "" }),
    );
    await page.route("**/auth/v1/user**", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockUser),
      }),
    );

    // POST /rest/v1/contacts — insert a contact AND simulate the DB
    // trigger by appending a Relationship to the in-memory store.
    await page.route("**/rest/v1/contacts**", async (route: Route) => {
      if (route.request().method() === "POST") {
        const body = JSON.parse(route.request().postData() ?? "{}");
        const insert = Array.isArray(body) ? body[0] : body;
        const contact: StoredContact = {
          id: `c-${relationships.length + 1}`,
          name: insert.name,
          phone: insert.phone ?? null,
          email: insert.email ?? null,
          created_at: new Date().toISOString(),
        };
        relationships.push({
          id: `r-${relationships.length + 1}`,
          target_type: "contact",
          created_at: contact.created_at,
          contact,
        });
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(contact),
        });
      }
      return route.fulfill({ status: 200, body: "[]" });
    });

    // GET /rest/v1/relationships — return the current list, embedding
    // the joined Contact as the client requests via `select=...,contact:contacts(...)`.
    await page.route("**/rest/v1/relationships**", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(relationships),
      }),
    );

    await page.goto("/");

    // Sign up to land on Home.
    await page.getByText(/new here\?/i).click();
    await page.getByPlaceholder("Email").fill("tdd@elsewhere.com");
    await page.getByPlaceholder("Password").fill("strong-pw");
    await page.getByText(/^sign up$/i).click();

    // Land on Home; the bottom-tab "Relationships" is visible.
    await expect(page.getByText(/threads closed/i)).toBeVisible();
    await page.getByRole("tab", { name: /relationships/i }).click();

    // All-relationships list shows the empty state.
    await expect(page.getByText(/no relationships yet/i)).toBeVisible();

    // Open the new-contact form, save a contact.
    await page.getByText(/new contact/i).click();
    await page.getByPlaceholder(/name/i).fill("Sam");
    await page.getByText(/^save$/i).click();

    // Back on the list, "Sam" appears as a row.
    await expect(page.getByText("Sam").first()).toBeVisible();

    // Drilling in lands on the detail view. The back button is detail-only,
    // so its presence is the proof we navigated rather than the (also
    // visible) list copy of "Sam".
    await page.getByText("Sam").first().click();
    await expect(page.getByText(/^‹ Back$/)).toBeVisible();
  });
});
