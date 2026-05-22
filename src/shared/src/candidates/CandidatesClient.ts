import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  toCandidateAction,
  toCandidateSet,
  type CandidateAction,
  type CandidateSet,
  type CandidateSetRow,
  type PassMode,
} from "./candidateSet";

export type {
  CandidateAction,
  CandidateSet,
  DecisionState,
  PassMode,
} from "./candidateSet";

/** Pending action from the latest Candidate Set for a Relationship. */
export interface PendingCandidateForUser {
  action: CandidateAction;
  candidateSetId: string;
  relationshipId: string;
  passMode: PassMode;
  setCreatedAt: string;
}

export interface CandidatesClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
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
    return toCandidateSet(rows[0]);
  }

  /**
   * Pending Candidate Actions from each Relationship's most recent Pass.
   * Older sets are ignored so stale suggestions don't accumulate.
   */
  async listPendingForUser(): Promise<PendingCandidateForUser[]> {
    const { data, error } = await this.client
      .from("candidate_sets")
      .select(
        "id, relationship_id, mode, created_at, candidate_actions(id, type, payload, why, decision_state)",
      )
      .order("created_at", { ascending: false });
    if (error) throw error;

    const rows = (data ?? []) as unknown as CandidateSetRow[];
    const seenRelationships = new Set<string>();
    const pending: PendingCandidateForUser[] = [];

    for (const row of rows) {
      if (seenRelationships.has(row.relationship_id)) continue;
      seenRelationships.add(row.relationship_id);

      for (const actionRow of row.candidate_actions ?? []) {
        if (actionRow.decision_state !== "pending") continue;
        if (actionRow.type === "DoNothing") continue;
        pending.push({
          action: toCandidateAction(actionRow),
          candidateSetId: row.id,
          relationshipId: row.relationship_id,
          passMode: row.mode,
          setCreatedAt: row.created_at,
        });
      }
    }

    return pending;
  }
}
