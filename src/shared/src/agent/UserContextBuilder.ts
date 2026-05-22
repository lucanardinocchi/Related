import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadUserContextCore,
  type AmbientUserContextSnapshot,
  type OperatorStrengthEntry,
} from "./userContextCore.ts";
import { projectForAmbientPass } from "./userContextProjections.ts";

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
      return projectForAmbientPass(
        {
          asOf: asOf.toISOString(),
          goalsAndValues: [],
          situationalState: null,
          transientIntent: [],
          groups: [],
          relationships: [],
          relationshipsTotal: 0,
        },
        { userId, operatorStrengths: [] },
      );
    }

    const [core, operatorStrengths] = await Promise.all([
      loadUserContextCore(this.supabase, {
        asOf,
        transientIntent: { kind: "none" },
        groupsOrder: "created_at_desc",
      }),
      this.loadOperatorStrengths(),
    ]);

    return projectForAmbientPass(core, { userId, operatorStrengths });
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
