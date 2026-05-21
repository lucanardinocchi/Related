import seedEntries from "./valuesSeedData.json";

export interface ValuesSeedEntry {
  id: string;
  name: string;
  source: string;
  values: string[];
}

/** 100 popular characters across film, TV, anime, games, sports, and history. */
export const VALUES_SEED_ENTRIES = seedEntries as ValuesSeedEntry[];

export const VALUES_SEED_COUNT = VALUES_SEED_ENTRIES.length;
