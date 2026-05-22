import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { OwnerIdResolver } from "../user-context/UserContextClient";
import type { ValuesCharacterDraft } from "./valuesCharacters";
import {
  alignmentToInferenceCharacter,
  buildInferencePayload,
  buildInferencePayloadFromRows,
  buildRankedInferencePayloadFromRows,
  buildSuggestCharactersPayload,
  resolveCharactersFromAlignments,
  type InferenceCharacter,
  type InferencePayload,
  type ProposedValuesProfile,
  type RankedInferencePayload,
  type SuggestCharactersPayload,
} from "./valuesAlignmentPayload";
import {
  ValuesAlignmentStore,
  type CharacterValuesAlignment,
} from "./valuesAlignmentStore";
import type { ValuesCharacter } from "./valuesCharacters";
import type {
  GenerateValuesCharacterPollPayload,
  GenerateValuesCharacterStartPayload,
  GenerateValuesCharacterStartResult,
} from "./valuesCharacterGeneration";

export type {
  CharacterValuesAlignment,
  InferenceCharacter,
  InferencePayload,
  ProposedValuesProfile,
  RankedInferencePayload,
  SuggestCharactersPayload,
};

export interface ValuesAlignmentClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/**
 * Facade over alignment persistence and Edge Function RPCs.
 */
export class ValuesAlignmentClient {
  private readonly store: ValuesAlignmentStore;

  constructor(
    private readonly client: SupabaseClient,
    resolveOwnerId: OwnerIdResolver,
  ) {
    this.store = new ValuesAlignmentStore(client, resolveOwnerId);
  }

  static fromConfig(
    config: ValuesAlignmentClientConfig,
    resolveOwnerId: OwnerIdResolver,
  ): ValuesAlignmentClient {
    return new ValuesAlignmentClient(
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false },
      }),
      resolveOwnerId,
    );
  }

  static alignmentToInferenceCharacter = alignmentToInferenceCharacter;
  static resolveCharactersFromAlignments = resolveCharactersFromAlignments;
  static buildInferencePayload = buildInferencePayload;
  static buildInferencePayloadFromRows = buildInferencePayloadFromRows;
  static buildRankedInferencePayloadFromRows = buildRankedInferencePayloadFromRows;
  static buildSuggestCharactersPayload = buildSuggestCharactersPayload;

  async listAlignments(): Promise<CharacterValuesAlignment[]> {
    return this.store.listAlignments();
  }

  async upsertAlignment(
    character: ValuesCharacter,
    aligned: boolean,
  ): Promise<CharacterValuesAlignment> {
    return this.store.upsertAlignment(character, aligned);
  }

  async saveRankings(orderedCharacterIds: string[]): Promise<void> {
    return this.store.saveRankings(orderedCharacterIds);
  }

  /**
   * Suggest one character from alignments (if needed), then start Seedance video.
   * Poll with {@link pollValuesCharacterGeneration} until status is ready.
   */
  async startValuesCharacterGeneration(
    payload: GenerateValuesCharacterStartPayload,
  ): Promise<GenerateValuesCharacterStartResult> {
    return this.invokeGenerateValuesCharacter({
      action: "start",
      ...payload,
    });
  }

  async pollValuesCharacterGeneration(
    payload: GenerateValuesCharacterPollPayload,
  ): Promise<GenerateValuesCharacterStartResult> {
    return this.invokeGenerateValuesCharacter(
      payload as unknown as Record<string, unknown>,
    );
  }

  private async invokeGenerateValuesCharacter(
    body: Record<string, unknown>,
  ): Promise<GenerateValuesCharacterStartResult> {
    const { data, error } = await this.client.functions.invoke(
      "generate-values-character",
      { body },
    );
    if (!error) return data as GenerateValuesCharacterStartResult;

    const parsed = await this.parseGenerateFunctionError(error);
    if (parsed) return parsed;

    throw new Error(
      (error as { message?: string }).message ??
        "generate-values-character failed",
    );
  }

  private async parseGenerateFunctionError(
    error: unknown,
  ): Promise<GenerateValuesCharacterStartResult | null> {
    const ctx = error as { context?: Response };
    if (!ctx.context) return null;
    try {
      return (await ctx.context.json()) as GenerateValuesCharacterStartResult;
    } catch {
      return null;
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
  async inferProposedProfile(
    payload: RankedInferencePayload,
  ): Promise<ProposedValuesProfile> {
    const { data, error } = await this.client.functions.invoke(
      "infer-values-from-alignments",
      { body: payload },
    );
    if (error) {
      const errMsg = (error as { message?: string }).message ??
        "infer-values-from-alignments failed";
      throw new Error(errMsg);
    }
    const body = data as {
      proposedValueSet?: unknown;
      proposedAttitude?: unknown;
      proposedGoals?: unknown;
    };
    const valueSet = Array.isArray(body.proposedValueSet)
      ? body.proposedValueSet
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
      : null;
    const attitude =
      typeof body.proposedAttitude === "string"
        ? body.proposedAttitude.trim()
        : "";
    const goals = Array.isArray(body.proposedGoals)
      ? body.proposedGoals
        .filter((goal): goal is string => typeof goal === "string")
        .map((goal) => goal.trim())
        .filter(Boolean)
      : [];
    if (!valueSet?.length || !attitude) {
      throw new Error(
        "infer-values-from-alignments returned incomplete profile",
      );
    }
    return { valueSet, attitude, goals };
  }
}
