import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("composes class strings via clsx", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("filters falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("merges conflicting tailwind utilities, last wins", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-fg-muted", "text-fg")).toBe("text-fg");
  });

  it("supports conditional objects", () => {
    expect(cn("a", { b: true, c: false })).toBe("a b");
  });
});
