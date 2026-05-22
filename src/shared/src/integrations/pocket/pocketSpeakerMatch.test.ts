import {
  matchUserSpeaker,
  speakerLabelsMatch,
  uniqueSpeakersFromTranscript,
} from "./pocketSpeakerMatch";

describe("speakerLabelsMatch", () => {
  it("matches exact display name case-insensitively", () => {
    expect(speakerLabelsMatch("Luca Nardinocchi", "luca nardinocchi")).toBe(true);
  });

  it("matches on first name when long enough", () => {
    expect(speakerLabelsMatch("Luca", "Luca Nardinocchi")).toBe(true);
  });

  it("does not match unrelated speakers", () => {
    expect(speakerLabelsMatch("Alice", "Luca Nardinocchi")).toBe(false);
  });
});

describe("matchUserSpeaker", () => {
  it("returns matched when one speaker matches account name", () => {
    const result = matchUserSpeaker(["Luca", "Alice"], "Luca Nardinocchi");
    expect(result).toEqual({ kind: "matched", userSpeaker: "Luca" });
  });

  it("returns ambiguous when multiple speakers match", () => {
    const result = matchUserSpeaker(["Luca Smith", "Luca Jones"], "Luca Smith");
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates).toHaveLength(2);
    }
  });

  it("returns no_match when no speaker matches account name", () => {
    const result = matchUserSpeaker(["Alice", "Bob"], "Luca Nardinocchi");
    expect(result).toEqual({
      kind: "no_match",
      speakers: ["Alice", "Bob"],
    });
  });
});

describe("uniqueSpeakersFromTranscript", () => {
  it("deduplicates speakers in order", () => {
    expect(
      uniqueSpeakersFromTranscript([
        { speaker: "Luca" },
        { speaker: "Alice" },
        { speaker: "Luca" },
      ]),
    ).toEqual(["Luca", "Alice"]);
  });
});
