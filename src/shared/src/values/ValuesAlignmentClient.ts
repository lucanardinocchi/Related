import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  getValuesCharacter,
  toValuesCharacter,
  type ValuesCharacter,
  type ValuesCharacterDraft,
} from "./valuesCharacters";

export interface CharacterValuesAlignment {
  id: string;
  characterId: string;
  aligned: boolean;
  rankPosition: number | null;
  characterName: string | null;
  characterSource: string | null;
  characterValues: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface InferenceCharacter {
  characterId: string;
  name: string;
  source: string;
  values: string[];
}

export interface InferencePayload {
  aligned: InferenceCharacter[];
  rejected: InferenceCharacter[];
}

export interface SuggestCharactersPayload {
  aligned: InferenceCharacter[];
  rejected: InferenceCharacter[];
  excludeIds: string[];
}

export interface ValuesAlignmentClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

interface CharacterValuesAlignmentRow {
  id: string;
  character_id: string;
  aligned: boolean;
  rank_position: number | null;
  character_name: string | null;
  character_source: string | null;
  character_values: string[] | null;
  created_at: string;
  updated_at: string;
}

function toCharacterValuesAlignment(
  row: CharacterValuesAlignmentRow,
): CharacterValuesAlignment {
  return {
    id: row.id,
    characterId: row.character_id,
    aligned: row.aligned,
    rankPosition: row.rank_position,
    characterName: row.character_name,
    characterSource: row.character_source,
    characterValues: row.character_values,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type ResolveOwnerId = () => Promise<string>;

/**
 * Persists the User's swipe assessment of whether a media character's values
 * align with who they want to be. RLS enforces ownership server-side.
 */
export class ValuesAlignmentClient {
  constructor(
    private readonly client: SupabaseClient,
    private readonly resolveOwnerId: ResolveOwnerId,
  ) {}

  static fromConfig(
    config: ValuesAlignmentClientConfig,
    resolveOwnerId: ResolveOwnerId,
  ): ValuesAlignmentClient {
    return new ValuesAlignmentClient(
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false },
      }),
      resolveOwnerId,
    );
  }

  static alignmentToInferenceCharacter(
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

  static resolveCharactersFromAlignments(
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

  static buildInferencePayload(
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

  static buildInferencePayloadFromRows(
    rows: CharacterValuesAlignment[],
  ): InferencePayload {
    const aligned: InferenceCharacter[] = [];
    const rejected: InferenceCharacter[] = [];

    for (const row of rows) {
      const entry = ValuesAlignmentClient.alignmentToInferenceCharacter(row);
      if (!entry) continue;
      if (row.aligned) aligned.push(entry);
      else rejected.push(entry);
    }

    return { aligned, rejected };
  }

  async listAlignments(): Promise<CharacterValuesAlignment[]> {
    const { data, error } = await this.client
      .from("user_character_values_alignment")
      .select(
        "id, character_id, aligned, rank_position, character_name, character_source, character_values, created_at, updated_at",
      )
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map((row) =>
      toCharacterValuesAlignment(row as CharacterValuesAlignmentRow),
    );
  }

  async upsertAlignment(
    character: ValuesCharacter,
    aligned: boolean,
  ): Promise<CharacterValuesAlignment> {
    const ownerId = await this.resolveOwnerId();
    const { data, error } = await this.client
      .from("user_character_values_alignment")
      .upsert(
        {
          owner_id: ownerId,
          character_id: character.id,
          aligned,
          character_name: character.name,
          character_source: character.source,
          character_values: character.values,
        },
        { onConflict: "owner_id,character_id" },
      )
      .select(
        "id, character_id, aligned, rank_position, character_name, character_source, character_values, created_at, updated_at",
      )
      .single();

    if (error) throw error;
    return toCharacterValuesAlignment(data as CharacterValuesAlignmentRow);
  }

  /**
   * Persist drag-and-drop order for aligned characters (1 = strongest alignment).
   */
  async saveRankings(orderedCharacterIds: string[]): Promise<void> {
    const ownerId = await this.resolveOwnerId();

    for (let index = 0; index < orderedCharacterIds.length; index++) {
      const characterId = orderedCharacterIds[index]!;
      const { error } = await this.client
        .from("user_character_values_alignment")
        .update({ rank_position: index + 1 })
        .eq("owner_id", ownerId)
        .eq("character_id", characterId)
        .eq("aligned", true);

      if (error) throw error;
    }
  }

  /**
   * AI-generated characters similar to the User's right-swipes.
   */
  async suggestCharacters(
    payload: SuggestCharactersPayload,
  ): Promise<ValuesCharacterDraft[]> {
    const { data, error } = await this.client.functions.invoke(
      "suggest-values-characters",
      { body: payload },
    );
    if (error) {
      const errMsg = (error as { message?: string }).message ??
        "suggest-values-characters failed";
      throw new Error(errMsg);
    }
    const characters = (data as { characters?: ValuesCharacterDraft[] })
      ?.characters;
    if (!Array.isArray(characters) || characters.length === 0) {
      throw new Error("suggest-values-characters returned no characters");
    }
    return characters;
  }

  /**
   * Invoke infer-values-from-alignments Edge Function. Read-only inference —
   * proposals are confirmed by the User before writing to Goals & Values.
   */
  async inferProposedGoals(payload: InferencePayload): Promise<string[]> {
    const { data, error } = await this.client.functions.invoke(
      "infer-values-from-alignments",
      { body: payload },
    );
    if (error) {
      const errMsg = (error as { message?: string }).message ??
        "infer-values-from-alignments failed";
      throw new Error(errMsg);
    }
    const goals = (data as { proposedGoals?: string[] })?.proposedGoals;
    if (!Array.isArray(goals)) {
      throw new Error("infer-values-from-alignments returned no proposedGoals");
    }
    return goals;
  }
}
