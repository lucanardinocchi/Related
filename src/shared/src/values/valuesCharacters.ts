import { assignCharacterMedia } from "./valuesCharacterMedia";
import { VALUES_SEED_ENTRIES } from "./valuesSeedData";

export interface ValuesCharacter {
  id: string;
  name: string;
  source: string;
  /** Used for AI inference only — not shown on swipe cards. */
  values: string[];
  videoUrl: string;
  /** Separate theme audio when using stock fallback clips; null when muxed. */
  themeAudioUrl: string | null;
  /** True when videoUrl includes baked-in background music. */
  mediaMuxed: boolean;
}

export type ValuesCharacterDraft = Pick<
  ValuesCharacter,
  "id" | "name" | "source" | "values"
>;

export const VALUES_CHARACTERS: ValuesCharacter[] = VALUES_SEED_ENTRIES.map(
  (entry) => assignCharacterMedia(entry),
);

const characterById = new Map(
  VALUES_CHARACTERS.map((character) => [character.id, character]),
);

export function getValuesCharacter(id: string): ValuesCharacter | undefined {
  return characterById.get(id);
}

/** CANONICAL — Deno edge function suggest-values-characters duplicates this; keep in sync. */
export function slugifyCharacterId(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function toValuesCharacter(draft: ValuesCharacterDraft): ValuesCharacter {
  return assignCharacterMedia({
    ...draft,
    id: draft.id || slugifyCharacterId(draft.name),
  });
}

export function mergeCharacterRegistry(
  seed: ValuesCharacter[],
  extras: ValuesCharacter[],
): ValuesCharacter[] {
  const byId = new Map(seed.map((c) => [c.id, c]));
  for (const character of extras) {
    byId.set(character.id, character);
  }
  return [...byId.values()];
}
