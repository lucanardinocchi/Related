import type { ValuesCharacter } from "./valuesCharacters";

export const QUEUE_LOW_WATER = 6;
export const SUGGEST_BATCH_SIZE = 8;

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export function buildSeedQueue(
  characters: ValuesCharacter[],
  alignments: Record<string, boolean | undefined>,
  includeReviewed: boolean,
  priorityIds: readonly string[] = [],
): ValuesCharacter[] {
  const pool = includeReviewed
    ? characters
    : characters.filter((character) => alignments[character.id] === undefined);

  const prioritySet = new Set(priorityIds);
  const priority = priorityIds
    .map((id) => pool.find((character) => character.id === id))
    .filter((character): character is ValuesCharacter => character !== undefined);
  const rest = pool.filter((character) => !prioritySet.has(character.id));

  return [...priority, ...shuffle(rest)];
}

export function appendUniqueQueue(
  queue: ValuesCharacter[],
  incoming: ValuesCharacter[],
  seenIds: Set<string>,
): ValuesCharacter[] {
  const existing = new Set(queue.map((c) => c.id));
  const fresh = incoming.filter(
    (c) => !seenIds.has(c.id) && !existing.has(c.id),
  );
  return [...queue, ...shuffle(fresh)];
}
