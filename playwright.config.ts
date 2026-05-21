import { defineConfig } from "@playwright/test";

// Post-ADR-0008: the web E2E target is the Next.js app in src/web/, not
// the old Expo web export. Tests are smoke-shaped — they navigate the
// new routes and assert headings; they do not perform live agent /
// supabase calls. `channel: "chrome"` uses the system-installed browser
// to keep the install footprint small.

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: "list",
  timeout: 30_000,
  webServer: {
    command: "npm run dev --workspace=@related/web -- --port 3000",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome",
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
});
