// Deno mirror of PassEngine.runPass — keep in sync with src/shared/src/agent/PassEngine.ts.

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { ensureDoNothingPeer } from "../../../../shared/src/agent/ambientTools.ts";
import { initialDecisionStateForCandidateAction } from "../../../../shared/src/candidates/candidateSet.ts";
import { buildRelationshipContext } from "./relationshipContext.ts";
import { buildUserContext } from "./userContext.ts";

export type PassMode = "baseline" | "triggered";

export interface CandidateActionInput {
  type: string;
  payload?: unknown;
  why?: string;
}

export interface AgentPrompt {
  mode: PassMode;
  relationshipContext: unknown;
  previousCandidateSet: unknown;
  userContext: unknown;
  liveContext?: unknown;
}

type DecisionState = "pending" | "picked" | "declined" | "ignored";

export async function invokeAmbientPass(
  supabaseUrl: string,
  serviceRoleKey: string,
  prompt: AgentPrompt,
): Promise<CandidateActionInput[]> {
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await client.functions.invoke("ambient-pass", {
    body: { prompt },
  });
  if (error) {
    const ctx = error as { context?: Response };
    const detail = ctx.context
      ? await ctx.context.json().catch(() => null) as { error?: string } | null
      : null;
    throw new Error(
      detail?.error ?? error.message ?? "ambient-pass invoke failed",
    );
  }
  const json = (data ?? {}) as { actions?: unknown; error?: string };
  if (json.error) {
    throw new Error(json.error);
  }
  if (!Array.isArray(json.actions)) {
    throw new Error("ambient-pass response missing `actions` array");
  }
  return json.actions as CandidateActionInput[];
}

export async function runAmbientPass(
  service: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string,
  input: { relationshipId: string; mode: PassMode },
): Promise<{ candidateSetId: string; ownerId: string }> {
  const { relationshipId, mode } = input;

  const relationshipContext = await buildRelationshipContext(
    service,
    relationshipId,
  );
  const relationship = relationshipContext.relationship as {
    owner_id: string;
  };
  const ownerId = relationship.owner_id;

  const { data: previousSetRows } = await service
    .from("candidate_sets")
    .select("id, mode")
    .eq("relationship_id", relationshipId)
    .order("created_at", { ascending: false })
    .limit(1);
  const previousSetRow =
    ((previousSetRows ?? []) as { id: string; mode: PassMode }[])[0] ?? null;

  let previousCandidateSet: unknown = null;
  if (previousSetRow) {
    const { data: actionRows, error: actionsErr } = await service
      .from("candidate_actions")
      .select("id, type, payload, why, decision_state")
      .eq("candidate_set_id", previousSetRow.id);
    if (actionsErr) throw actionsErr;
    const rows = (actionRows ?? []) as Array<{
      id: string;
      type: string;
      payload: unknown;
      why: string | null;
      decision_state: DecisionState;
    }>;
    previousCandidateSet = {
      id: previousSetRow.id,
      mode: previousSetRow.mode,
      actions: rows.map((r) => ({
        id: r.id,
        type: r.type,
        payload: r.payload,
        why: r.why,
        decisionState: r.decision_state,
      })),
    };
  }

  const userContext = await buildUserContext(service, ownerId, new Date());

  const prompt: AgentPrompt = {
    mode,
    relationshipContext,
    previousCandidateSet,
    userContext,
  };
  const actions = ensureDoNothingPeer(
    await invokeAmbientPass(supabaseUrl, serviceRoleKey, prompt),
  );

  const { data: newSet, error: setErr } = await service
    .from("candidate_sets")
    .insert({ owner_id: ownerId, relationship_id: relationshipId, mode })
    .select("id")
    .single();
  if (setErr || !newSet) {
    throw setErr ?? new Error("failed to persist candidate set");
  }

  if (actions.length > 0) {
    const { error: actErr } = await service
      .from("candidate_actions")
      .insert(
        actions.map((a) => ({
          owner_id: ownerId,
          candidate_set_id: newSet.id,
          type: a.type,
          payload: a.payload ?? null,
          why: a.why ?? null,
          decision_state: initialDecisionStateForCandidateAction(a.type),
        })),
      );
    if (actErr) throw actErr;
  }

  return { candidateSetId: newSet.id as string, ownerId };
}
