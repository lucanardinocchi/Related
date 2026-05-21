import { buildRankedInferencePayloadFromRows } from "./valuesAlignmentPayload";
import type { CharacterValuesAlignment } from "./valuesAlignmentStore";

function row(
  overrides: Partial<CharacterValuesAlignment> &
    Pick<CharacterValuesAlignment, "characterId" | "aligned">,
): CharacterValuesAlignment {
  return {
    id: overrides.id ?? `row-${overrides.characterId}`,
    characterId: overrides.characterId,
    aligned: overrides.aligned,
    rankPosition: overrides.rankPosition ?? null,
    characterName: overrides.characterName ?? null,
    characterSource: overrides.characterSource ?? null,
    characterValues: overrides.characterValues ?? null,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00Z",
  };
}

describe("buildRankedInferencePayloadFromRows", () => {
  it("orders rankedTop by rankedCharacterIds and assigns ranks 1..n", () => {
    const rows = [
      row({
        characterId: "a",
        aligned: true,
        characterName: "Alpha",
        characterSource: "Show A",
        characterValues: ["Loyalty", "Courage"],
      }),
      row({
        characterId: "b",
        aligned: true,
        characterName: "Beta",
        characterSource: "Show B",
        characterValues: ["Kindness", "Curiosity"],
      }),
      row({
        characterId: "c",
        aligned: false,
        characterName: "Gamma",
        characterSource: "Show C",
        characterValues: ["Control", "Power"],
      }),
    ];

    const payload = buildRankedInferencePayloadFromRows(rows, ["b", "a"]);

    expect(payload.rankedTop).toEqual([
      {
        characterId: "b",
        name: "Beta",
        source: "Show B",
        values: ["Kindness", "Curiosity"],
        rank: 1,
      },
      {
        characterId: "a",
        name: "Alpha",
        source: "Show A",
        values: ["Loyalty", "Courage"],
        rank: 2,
      },
    ]);
    expect(payload.rejected).toEqual([
      {
        characterId: "c",
        name: "Gamma",
        source: "Show C",
        values: ["Control", "Power"],
      },
    ]);
  });

  it("skips unaligned or unknown ids in rankedCharacterIds", () => {
    const rows = [
      row({
        characterId: "a",
        aligned: true,
        characterName: "Alpha",
        characterSource: "Show A",
        characterValues: ["Loyalty"],
      }),
      row({
        characterId: "b",
        aligned: false,
        characterName: "Beta",
        characterSource: "Show B",
        characterValues: ["Control"],
      }),
    ];

    const payload = buildRankedInferencePayloadFromRows(rows, ["missing", "b", "a"]);

    expect(payload.rankedTop).toEqual([
      {
        characterId: "a",
        name: "Alpha",
        source: "Show A",
        values: ["Loyalty"],
        rank: 1,
      },
    ]);
    expect(payload.rejected).toHaveLength(1);
  });
});
