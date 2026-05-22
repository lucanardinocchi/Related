import {
  contactDisplayLabel,
  contactInitials,
  firstNamesWithDuplicates,
  parsePocketAttributedLine,
  resolveContactNameFromPocketLabel,
  segmentPocketAssistantContent,
} from "./contactDisplay";

describe("contactDisplayLabel", () => {
  const dupes = firstNamesWithDuplicates([
    "Sam Chen",
    "Sam Walsh",
    "Emma Jones",
  ]);

  it("uses first name only when unique", () => {
    expect(contactDisplayLabel("Emma Jones", dupes)).toBe("Emma");
  });

  it("adds last initial when first name is duplicated", () => {
    expect(contactDisplayLabel("Sam Chen", dupes)).toBe("Sam C");
    expect(contactDisplayLabel("Sam Walsh", dupes)).toBe("Sam W");
  });
});

describe("contactInitials", () => {
  it("uses first and last initials for multi-part names", () => {
    expect(contactInitials("Sam Chen")).toBe("SC");
  });
});

describe("pocket attributed content", () => {
  it("parses bracket labels", () => {
    expect(
      parsePocketAttributedLine("[Sam (Sam Chen)]: Hey there"),
    ).toEqual({ label: "Sam (Sam Chen)", text: "Hey there" });
  });

  it("resolves contact name from diarized label", () => {
    expect(resolveContactNameFromPocketLabel("Sam (Sam Chen)")).toBe(
      "Sam Chen",
    );
    expect(resolveContactNameFromPocketLabel("Sam Chen")).toBe("Sam Chen");
  });

  it("merges consecutive lines from the same contact", () => {
    expect(
      segmentPocketAssistantContent(
        "[Sam (Sam Chen)]: line one\n[Sam (Sam Chen)]: line two",
      ),
    ).toEqual([
      { kind: "attributed", contactName: "Sam Chen", text: "line one\nline two" },
    ]);
  });
});
