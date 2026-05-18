import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type PassMode = "baseline" | "triggered" | "engaged";

export type DecisionState = "pending" | "picked" | "declined" | "ignored";

export interface CandidateAction {
  id: string;
  type: string;
  payload: unknown;
  why: string | null;
  decisionState: DecisionState;
}

export interface CandidateSet {
  id: string;
  relationshipId: string;
  mode: PassMode;
  createdAt: string;
  actions: CandidateAction[];
}

export interface CandidatesClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

interface CandidateActionRow {
  id: string;
  type: string;
  payload: unknown;
  why: string | null;
  decision_state: DecisionState;
}

interface CandidateSetRow {
  id: string;
  relationship_id: string;
  mode: PassMode;
  created_at: string;
  candidate_actions: CandidateActionRow[];
}

function toAction(row: CandidateActionRow): CandidateAction {
  return {
    id: row.id,
    type: row.type,
    payload: row.payload,
    why: row.why,
    decisionState: row.decision_state,
  };
}

function toSet(row: CandidateSetRow): CandidateSet {
  return {
    id: row.id,
    relationshipId: row.relationship_id,
    mode: row.mode,
    createdAt: row.created_at,
    actions: (row.candidate_actions ?? []).map(toAction),
  };
}

/**
 * Reads Candidate Sets + Candidate Actions on behalf of the signed-in User.
 * The Single Relationship view calls `getLatestForRelationship` on mount;
 * the Pass Engine writes new sets server-side (or via the Pass Engine
 * directly when running in-process).
 */
export class CandidatesClient {
  constructor(private readonly client: SupabaseClient) {}

  static fromConfig(config: CandidatesClientConfig): CandidatesClient {
    return new CandidatesClient(
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false },
      }),
    );
  }

  async getLatestForRelationship(
    relationshipId: string,
  ): Promise<CandidateSet | null> {
    const { data, error } = await this.client
      .from("candidate_sets")
      .select(
        "id, relationship_id, mode, created_at, candidate_actions(id, type, payload, why, decision_state)",
      )
      .eq("relationship_id", relationshipId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as CandidateSetRow[];
    if (rows.length === 0) return null;
    return toSet(rows[0]);
  }
}
