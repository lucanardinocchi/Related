import {
  assignCharacterMedia,
  filterCharactersWithMedia,
  hasGeneratedMedia,
} from "./valuesCharacterMedia";

describe("valuesCharacterMedia", () => {
  it("hasGeneratedMedia is true for manifest entries", () => {
    expect(hasGeneratedMedia("ted-lasso")).toBe(true);
    expect(hasGeneratedMedia("not-a-character")).toBe(false);
  });

  it("assignCharacterMedia uses manifest URL when present", () => {
    const withMedia = assignCharacterMedia({
      id: "ted-lasso",
      name: "Ted Lasso",
      source: "Ted Lasso",
      values: ["Kindness"],
    });
    expect(withMedia.videoUrl).toContain("ted-lasso.mp4");
    expect(withMedia.mediaMuxed).toBe(true);
    expect(withMedia.themeAudioUrl).toBeNull();
  });

  it("assignCharacterMedia leaves video empty without manifest entry", () => {
    const withoutMedia = assignCharacterMedia({
      id: "unknown-character",
      name: "Unknown",
      source: "Nowhere",
      values: ["Hope"],
    });
    expect(withoutMedia.videoUrl).toBe("");
    expect(withoutMedia.mediaMuxed).toBe(false);
  });

  it("filterCharactersWithMedia keeps only manifest characters", () => {
    const filtered = filterCharactersWithMedia([
      { id: "ted-lasso" },
      { id: "unknown-character" },
    ]);
    expect(filtered.map((c) => c.id)).toEqual(["ted-lasso"]);
  });
});
