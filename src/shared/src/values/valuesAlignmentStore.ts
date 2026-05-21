import type { SupabaseClient } from "@supabase/supabase-js";
import type { OwnerIdResolver } from "../user-context/UserContextClient";
import type { ValuesCharacter } from "./valuesCharacters";

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

/**
 * Persists the User's swipe assessment of whether a media character's values
 * align with who they want to be. RLS enforces ownership server-side.
 */
export class ValuesAlignmentStore {
  constructor(
    private readonly client: SupabaseClient,
    private readonly resolveOwnerId: OwnerIdResolver,
  ) {}

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
    const { error } = await this.client.rpc("save_character_values_rankings", {
      p_owner_id: ownerId,
      p_character_ids: orderedCharacterIds,
    });
    if (error) throw error;
  }
}
