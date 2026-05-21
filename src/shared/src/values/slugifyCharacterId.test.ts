import { slugifyCharacterId } from "./valuesCharacters";

/**
 * Golden vectors for slugifyCharacterId — the canonical implementation lives in
 * valuesCharacters.ts. The Deno edge function suggest-values-characters must
 * keep its duplicate in sync with these expectations.
 */
describe("slugifyCharacterId", () => {
  it.each([
    ["basic kebab-case", "Han Solo", "han-solo"],
    ["preserves digits", "R2-D2", "r2-d2"],
    ["strips accents (NFKD)", "Renée", "renee"],
    ["strips multi-byte accents", "José García", "jose-garcia"],
    ["umlauts decompose to ascii", "Müller", "muller"],
    ["collapses punctuation", "Dr. Strange", "dr-strange"],
    ["collapses whitespace", "Iron   Man", "iron-man"],
    ["trims leading and trailing separators", "  Spider-Man  ", "spider-man"],
    ["apostrophe becomes hyphen", "O'Brien", "o-brien"],
    ["parentheses become separators", "John (Smith)", "john-smith"],
    ["strips emoji", "Hero 🔥", "hero"],
    ["non-latin script yields empty slug", "北京", ""],
    ["only separators yields empty slug", "---", ""],
    ["empty string", "", ""],
    [
      "caps slug length at 80 characters",
      "x".repeat(100),
      "x".repeat(80),
    ],
    [
      "caps after normalization and hyphen collapse",
      `${"ab".repeat(45)} cd`,
      `${"ab".repeat(40)}`,
    ],
  ])("%s", (_label, input, expected) => {
    expect(slugifyCharacterId(input)).toBe(expected);
  });
});
