import { defineConfig } from "@playwright/test";

// Tests run against the Expo web export, served as static files.
// `channel: "chrome"` uses the system-installed Google Chrome (no Playwright
// browser download) — keeps the install footprint small.

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: "list",
  timeout: 30_000,
  webServer: {
    command: "python3 -m http.server 8080 --directory src/frontend/dist",
    url: "http://localhost:8080",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  use: {
    baseURL: "http://localhost:8080",
    channel: "chrome",
    headless: true,
    viewport: { width: 390, height: 844 },
  },
});
