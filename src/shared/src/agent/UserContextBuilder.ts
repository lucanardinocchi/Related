import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AmbientUserContextSnapshot,
  GoalEntry,
  OperatorStrengthEntry,
  SituationalStateSnapshot,
} from "./userContextCore.ts";
import { mapGoalRows, mapSituationalRow } from "./userContextCore.ts";

export type {
  AmbientUserContextSnapshot,
  AmbientUserContextSnapshot as UserContextSnapshot,
  GoalEntry,
  SituationalStateSnapshot,
  OperatorStrengthEntry,
} from "./userContextCore.ts";

export interface UserContextBuilderOptions {
  supabase?: SupabaseClient;
}

interface OperatorStrengthRow {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

/**
 * User Context Builder for Ambient Intelligence — Goals & Values, Situational
 * State, and Operator Strengths only.
 */
export class UserContextBuilder {
  private readonly supabase?: SupabaseClient;

  constructor(opts: UserContextBuilderOptions = {}) {
    this.supabase = opts.supabase;
  }

  async buildUserContext(
    userId: string,
    asOf: Date,
  ): Promise<AmbientUserContextSnapshot> {
    if (!this.supabase) {
      return {
        userId,
        asOf: asOf.toISOString(),
        goalsAndValues: [],
        situationalState: null,
        operatorStrengths: [],
      };
    }

    const [goalsAndValues, situationalState, operatorStrengths] =
      await Promise.all([
        this.loadGoalsAndValues(),
        this.loadSituationalState(),
        this.loadOperatorStrengths(),
      ]);

    return {
      userId,
      asOf: asOf.toISOString(),
      goalsAndValues,
      situationalState,
      operatorStrengths,
    };
  }

  private async loadGoalsAndValues(): Promise<GoalEntry[]> {
    if (!this.supabase) return [];
    const { data, error } = await this.supabase
      .from("goals_and_values")
      .select("id, content, created_at, updated_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return mapGoalRows((data ?? []) as Parameters<typeof mapGoalRows>[0]);
  }

  private async loadSituationalState(): Promise<SituationalStateSnapshot | null> {
    if (!this.supabase) return null;
    const { data, error } = await this.supabase
      .from("situational_state")
      .select("id, content, created_at, updated_at")
      .maybeSingle();
    if (error) throw error;
    return mapSituationalRow(
      (data ?? null) as Parameters<typeof mapSituationalRow>[0],
    );
  }

  private async loadOperatorStrengths(): Promise<OperatorStrengthEntry[]> {
    if (!this.supabase) return [];
    const { data, error } = await this.supabase
      .from("operator_strengths")
      .select("id, content, created_at, updated_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as OperatorStrengthRow[]).map((r) => ({
      id: r.id,
      content: r.content,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }
}
