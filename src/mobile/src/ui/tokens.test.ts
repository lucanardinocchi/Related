import { colors } from "./tokens";

describe("mobile design tokens", () => {
  // Locks the canonical Notion palette anchor between web (CSS custom
  // properties in src/web/app/globals.css) and mobile (this file). If
  // these drift, the design language drifts.
  it("colors.fg matches the web --color-fg token", () => {
    expect(colors.fg).toBe("#37352f");
  });
});
