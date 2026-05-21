import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vitest config for src/web unit tests (Phase 5 of ADR-0008 redesign).
// Server-side route tests stay in Playwright E2E — vitest is for pure
// helpers (cn, typography classes, analytics adapters) and Client
// Components rendered via @testing-library/react.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "dist"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
