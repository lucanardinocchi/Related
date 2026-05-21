import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface Goal {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface SituationalState {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperatorStrength {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserContextClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

interface GoalRow {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface SituationalStateRow {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface OperatorStrengthRow {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

function toGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toState(row: SituationalStateRow): SituationalState {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toOperatorStrength(row: OperatorStrengthRow): OperatorStrength {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Resolver for the signed-in User's id. Caller-provided so we don't double
 * up on `supabase.auth.getUser()` from many call sites; the client is
 * always constructed inside an authenticated session.
 */
export type OwnerIdResolver = () => Promise<string>;

/**
 * Reads + writes the two User Context flavours that land in Slice 10:
 * Goals & Values (multi-row, User-authored only) and Situational State
 * (singleton-per-User, editable by User AND silently writable by the
 * Engaged Pass).
 */
export class UserContextClient {
  constructor(
    private readonly client: SupabaseClient,
    private readonly resolveOwnerId: OwnerIdResolver,
  ) {}

  static fromConfig(
    config: UserContextClientConfig,
    resolveOwnerId: OwnerIdResolver,
  ): UserContextClient {
    return new UserContextClient(
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false },
      }),
      resolveOwnerId,
    );
  }

  async listGoals(): Promise<Goal[]> {
    const { data, error } = await this.client
      .from("goals_and_values")
      .select("id, content, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as GoalRow[]).map(toGoal);
  }

  async addGoal(content: string): Promise<Goal> {
    const ownerId = await this.resolveOwnerId();
    const { data, error } = await this.client
      .from("goals_and_values")
      .insert({ owner_id: ownerId, content })
      .select()
      .single();
    if (error) throw error;
    return toGoal(data as GoalRow);
  }

  async updateGoal(id: string, content: string): Promise<void> {
    const { error } = await this.client
      .from("goals_and_values")
      .update({ content })
      .eq("id", id);
    if (error) throw error;
  }

  async deleteGoal(id: string): Promise<void> {
    const { error } = await this.client
      .from("goals_and_values")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }

  async getSituationalState(): Promise<SituationalState | null> {
    const { data, error } = await this.client
      .from("situational_state")
      .select("id, content, created_at, updated_at")
      .maybeSingle();
    if (error) throw error;
    return data ? toState(data as SituationalStateRow) : null;
  }

  async setSituationalState(content: string): Promise<SituationalState> {
    const ownerId = await this.resolveOwnerId();
    const { data, error } = await this.client
      .from("situational_state")
      .upsert({ owner_id: ownerId, content }, { onConflict: "owner_id" })
      .select()
      .single();
    if (error) throw error;
    return toState(data as SituationalStateRow);
  }

  async listOperatorStrengths(): Promise<OperatorStrength[]> {
    const { data, error } = await this.client
      .from("operator_strengths")
      .select("id, content, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as OperatorStrengthRow[]).map(toOperatorStrength);
  }

  async addOperatorStrength(content: string): Promise<OperatorStrength> {
    const ownerId = await this.resolveOwnerId();
    const { data, error } = await this.client
      .from("operator_strengths")
      .insert({ owner_id: ownerId, content })
      .select()
      .single();
    if (error) throw error;
    return toOperatorStrength(data as OperatorStrengthRow);
  }

  async updateOperatorStrength(id: string, content: string): Promise<void> {
    const { error } = await this.client
      .from("operator_strengths")
      .update({ content })
      .eq("id", id);
    if (error) throw error;
  }

  async deleteOperatorStrength(id: string): Promise<void> {
    const { error } = await this.client
      .from("operator_strengths")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }
}
