export type PassMode = "baseline" | "triggered";

export type DecisionState = "pending" | "picked" | "declined" | "ignored";

/** Candidate types surfaced in Suggested actions and relationship candidate UI. */
export function isUserVisibleCandidateAction(type: string): boolean {
  return type !== "DoNothing";
}

export function filterUserVisibleCandidateActions<
  T extends { type: string },
>(actions: T[]): T[] {
  return actions.filter((a) => isUserVisibleCandidateAction(a.type));
}

/** DoNothing passes are recorded for agent history but never await User review. */
export function initialDecisionStateForCandidateAction(
  type: string,
): DecisionState {
  return type === "DoNothing" ? "ignored" : "pending";
}

/** Agent-proposed action before persistence (no id, no decision state). */
export interface CandidateActionInput {
  type: string;
  payload?: unknown;
  why?: string;
}

/** Persisted Candidate Action as read from the database. */
export interface CandidateAction {
  id: string;
  type: string;
  payload: unknown;
  why: string | null;
  decisionState: DecisionState;
}

/** Persisted Candidate Set as read from the database. */
export interface CandidateSet {
  id: string;
  relationshipId: string;
  mode: PassMode;
  createdAt: string;
  actions: CandidateAction[];
}

/** Candidate Set produced by a Pass run (actions not yet re-read with ids). */
export interface PassCandidateSet {
  id: string;
  ownerId: string;
  relationshipId: string;
  mode: PassMode;
  createdAt: string;
  actions: CandidateActionInput[];
}

export interface PreviousCandidateAction {
  id: string;
  type: string;
  payload: unknown;
  why: string | null;
  decisionState: DecisionState;
}

export interface PreviousCandidateSet {
  id: string;
  mode: PassMode;
  actions: PreviousCandidateAction[];
}

export interface CandidateActionRow {
  id: string;
  type: string;
  payload: unknown;
  why: string | null;
  decision_state: DecisionState;
}

export interface CandidateSetRow {
  id: string;
  relationship_id: string;
  mode: PassMode;
  created_at: string;
  candidate_actions?: CandidateActionRow[];
}

export function toCandidateAction(row: CandidateActionRow): CandidateAction {
  return {
    id: row.id,
    type: row.type,
    payload: row.payload,
    why: row.why,
    decisionState: row.decision_state,
  };
}

export function toCandidateSet(row: CandidateSetRow): CandidateSet {
  return {
    id: row.id,
    relationshipId: row.relationship_id,
    mode: row.mode,
    createdAt: row.created_at,
    actions: (row.candidate_actions ?? []).map(toCandidateAction),
  };
}
