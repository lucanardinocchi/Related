import {
  getValuesCharacter,
  toValuesCharacter,
  type ValuesCharacter,
} from "./valuesCharacters";
import type { CharacterValuesAlignment } from "./valuesAlignmentStore";

export interface InferenceCharacter {
  characterId: string;
  name: string;
  source: string;
  values: string[];
}

export interface RankedInferenceCharacter extends InferenceCharacter {
  /** 1 = strongest alignment among the User's top picks. */
  rank: number;
}

export interface InferencePayload {
  aligned: InferenceCharacter[];
  rejected: InferenceCharacter[];
}

/** Top-ranked characters drive Values Discovery inference. See ADR-0011. */
export interface RankedInferencePayload {
  rankedTop: RankedInferenceCharacter[];
  rejected: InferenceCharacter[];
}

export interface ProposedValuesProfile {
  valueSet: string[];
  attitude: string;
  goals: string[];
}

export interface SuggestCharactersPayload {
  aligned: InferenceCharacter[];
  rejected: InferenceCharacter[];
  excludeIds: string[];
}

export function alignmentToInferenceCharacter(
  row: CharacterValuesAlignment,
): InferenceCharacter | null {
  const seed = getValuesCharacter(row.characterId);
  const name = row.characterName ?? seed?.name;
  const source = row.characterSource ?? seed?.source;
  const values = row.characterValues ?? seed?.values;
  if (!name || !source || !values?.length) return null;
  return {
    characterId: row.characterId,
    name,
    source,
    values,
  };
}

export function resolveCharactersFromAlignments(
  rows: CharacterValuesAlignment[],
  seed: ValuesCharacter[],
): ValuesCharacter[] {
  const seedById = new Map(seed.map((c) => [c.id, c]));
  const byId = new Map<string, ValuesCharacter>();

  for (const row of rows) {
    const existing = seedById.get(row.characterId);
    if (existing) {
      byId.set(row.characterId, existing);
      continue;
    }
    if (row.characterName && row.characterSource && row.characterValues) {
      byId.set(
        row.characterId,
        toValuesCharacter({
          id: row.characterId,
          name: row.characterName,
          source: row.characterSource,
          values: row.characterValues,
        }),
      );
    }
  }

  return [...byId.values()];
}

export function buildInferencePayload(
  alignments: Record<string, boolean>,
  characters: ValuesCharacter[],
): InferencePayload {
  const aligned: InferenceCharacter[] = [];
  const rejected: InferenceCharacter[] = [];

  for (const character of characters) {
    const decision = alignments[character.id];
    if (decision === undefined) continue;

    const entry: InferenceCharacter = {
      characterId: character.id,
      name: character.name,
      source: character.source,
      values: character.values,
    };

    if (decision) aligned.push(entry);
    else rejected.push(entry);
  }

  return { aligned, rejected };
}

export function buildInferencePayloadFromRows(
  rows: CharacterValuesAlignment[],
): InferencePayload {
  const aligned: InferenceCharacter[] = [];
  const rejected: InferenceCharacter[] = [];

  for (const row of rows) {
    const entry = alignmentToInferenceCharacter(row);
    if (!entry) continue;
    if (row.aligned) aligned.push(entry);
    else rejected.push(entry);
  }

  return { aligned, rejected };
}

export function buildSuggestCharactersPayload(
  alignments: Record<string, boolean>,
  characters: ValuesCharacter[],
  excludeIds: Iterable<string>,
): SuggestCharactersPayload {
  return {
    ...buildInferencePayload(alignments, characters),
    excludeIds: [...excludeIds],
  };
}

/**
 * Build inference input from the User's saved top-N ranking. Rank order is
 * preserved (index 0 → rank 1). Rejected characters are included for contrast.
 */
export function buildRankedInferencePayloadFromRows(
  rows: CharacterValuesAlignment[],
  rankedCharacterIds: string[],
): RankedInferencePayload {
  const rowById = new Map(rows.map((row) => [row.characterId, row]));
  const rankedTop: RankedInferenceCharacter[] = [];
  let rank = 0;

  for (const characterId of rankedCharacterIds) {
    const row = rowById.get(characterId);
    if (!row?.aligned) continue;
    const entry = alignmentToInferenceCharacter(row);
    if (!entry) continue;
    rank += 1;
    rankedTop.push({ ...entry, rank });
  }

  const rejected: InferenceCharacter[] = [];
  for (const row of rows) {
    if (row.aligned) continue;
    const entry = alignmentToInferenceCharacter(row);
    if (entry) rejected.push(entry);
  }

  return { rankedTop, rejected };
}
