import { expect, test, type Route } from "@playwright/test";

/**
 * Slice 6 happy path: a signed-in User opens the Groups tab, creates a Group
 * with one picked member, sees the new Group in the list, drills in, and
 * sees the member alongside (empty) open-threads and history sections.
 *
 * All Supabase Auth + REST + RPC traffic is mocked at the browser network
 * layer — no real DB, no PostgREST. The mock approximates the contracts of
 * the migrations rather than running them: the contacts trigger appends a
 * Contact-targeted Relationship, the groups trigger appends a Group-targeted
 * one, and `add_group_member` appends a contact_groups row.
 */
test.describe("Slice 6 happy path — Groups", () => {
  test("sign in → Groups tab → create Group → list → drill in", async ({
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

    type StoredContact = {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      created_at: string;
    };
    type StoredGroup = {
      id: string;
      name: string;
      created_at: string;
    };
    type StoredRelationship =
      | {
          id: string;
          target_type: "contact";
          created_at: string;
          contact: StoredContact;
        }
      | {
          id: string;
          target_type: "group";
          created_at: string;
          group: StoredGroup;
        };
    type StoredMembership = {
      contact_id: string;
      group_id: string;
    };

    // Seed: one existing contact "Sam" the user will later add to the new
    // Group. Mirrors what slice 2 leaves on the DB after a happy path.
    const sam: StoredContact = {
      id: "c-sam",
      name: "Sam",
      phone: null,
      email: null,
      created_at: "2026-05-17T00:00:00Z",
    };
    const relationships: StoredRelationship[] = [
      {
        id: "r-sam",
        target_type: "contact",
        created_at: "2026-05-17T00:00:00Z",
        contact: sam,
      },
    ];
    const groups: StoredGroup[] = [];
    const memberships: StoredMembership[] = [];

    // Catch-all FIRST so any later .route() registration wins (Playwright
    // applies routes in reverse registration order). Without this, requests
    // that don't match a specific mock would be forwarded to the real
    // localhost:54321 (which isn't running in this test) and time out.
    await page.route("**/auth/v1/**", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockSession),
      }),
    );
    await page.route("**/rest/v1/**", (route: Route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );

    await page.route("**/auth/v1/token**", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockSession),
      }),
    );
    await page.route("**/auth/v1/user**", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockUser),
      }),
    );

    // contacts: list-only. The test starts with Sam pre-seeded.
    await page.route("**/rest/v1/contacts**", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([sam]),
      }),
    );

    // relationships: GET returns the polymorphic list filtered by
    // target_type=… (Contact vs Group depending on which screen is querying).
    await page.route("**/rest/v1/relationships**", (route: Route) => {
      const url = route.request().url();
      let filtered: StoredRelationship[] = relationships;
      if (url.includes("target_type=eq.contact")) {
        filtered = relationships.filter((r) => r.target_type === "contact");
      } else if (url.includes("target_type=eq.group")) {
        filtered = relationships.filter((r) => r.target_type === "group");
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(filtered),
      });
    });

    // POST /rest/v1/groups — create a Group AND simulate the trigger that
    // pairs each Group with a Group-targeted Relationship.
    await page.route("**/rest/v1/groups**", async (route: Route) => {
      if (route.request().method() === "POST") {
        const body = JSON.parse(route.request().postData() ?? "{}");
        const insert = Array.isArray(body) ? body[0] : body;
        const group: StoredGroup = {
          id: `g-${groups.length + 1}`,
          name: insert.name,
          created_at: new Date().toISOString(),
        };
        groups.push(group);
        relationships.push({
          id: `r-g-${groups.length}`,
          target_type: "group",
          created_at: group.created_at,
          group,
        });
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(group),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(groups),
      });
    });

    // contact_groups: GET filters by either group_id or contact_id (the
    // listMembers vs listForContact callsites). Hydrate the embed shape
    // the client requests.
    await page.route("**/rest/v1/contact_groups**", (route: Route) => {
      const url = route.request().url();
      if (route.request().method() === "GET") {
        let result: unknown[] = [];
        const byGroup = url.match(/group_id=eq\.([^&]+)/);
        if (byGroup) {
          const gid = decodeURIComponent(byGroup[1]);
          result = memberships
            .filter((m) => m.group_id === gid)
            .map((m) => ({
              contact: relationships
                .filter(
                  (r): r is Extract<StoredRelationship, { target_type: "contact" }> =>
                    r.target_type === "contact",
                )
                .find((r) => r.contact.id === m.contact_id)?.contact,
            }));
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(result),
        });
      }
      return route.fulfill({ status: 200, body: "[]" });
    });

    // RPC: add_group_member appends a membership row keyed by the body.
    await page.route("**/rest/v1/rpc/add_group_member**", (route: Route) => {
      const body = JSON.parse(route.request().postData() ?? "{}");
      memberships.push({
        contact_id: body.p_contact_id,
        group_id: body.p_group_id,
      });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(null),
      });
    });

    // RPC: closed_threads_per_day — Home polls this on first paint.
    await page.route(
      "**/rest/v1/rpc/closed_threads_per_day**",
      (route: Route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        }),
    );

    // open_threads: drives Home's carousel + the Single Group view's open
    // threads section. Always empty for this test.
    await page.route("**/rest/v1/open_threads**", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      }),
    );
    await page.route(
      "**/rest/v1/open_thread_relationships**",
      (route: Route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        }),
    );

    // interactions: Single Group view queries listForGroup; Calendar /
    // history reads return empty.
    await page.route("**/rest/v1/interactions**", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      }),
    );

    await page.goto("/");

    // Sign in to land on Home.
    await page.getByPlaceholder("Email").fill("tdd@elsewhere.com");
    await page.getByPlaceholder("Password").fill("strong-pw");
    await page.getByText(/^sign in$/i).click();
    await expect(page.getByText(/threads closed/i)).toBeVisible();

    // Open the Groups tab — empty state. react-native-web's bottom-tabs
    // render with extra glyph characters in the accessible name, so target
    // by visible text instead. The "Groups" tab label is unique on Home.
    await page.getByText("Groups", { exact: true }).click();
    await expect(page.getByText(/no groups yet/i)).toBeVisible();

    // Create a Group with Sam as a member.
    await page.getByText(/new group/i).click();
    await page.getByPlaceholder(/name/i).fill("college friends");
    await page.getByText("Sam").click();
    await page.getByText(/^create$/i).click();

    // Back in the list — the new Group shows up.
    await expect(page.getByText("college friends")).toBeVisible();

    // Drill in. The detail surface shows the Group's name, its member,
    // and the empty states for threads + history.
    await page.getByText("college friends").click();
    await expect(page.getByText(/^‹ Back$/)).toBeVisible();
    // "Sam" is also rendered in the now-hidden CreateGroup modal that
    // remains on the navigation stack; .last() picks the live detail-view
    // copy. Empty-state proofs follow.
    // Use .last() throughout: the back-stack still holds the previous List
    // and Create screens, so most copy is duplicated across the DOM.
    await expect(page.getByText("Sam").last()).toBeVisible();
    await expect(page.getByText(/no open threads/i).last()).toBeVisible();
    await expect(page.getByText(/no interactions yet/i).last()).toBeVisible();
  });
});
