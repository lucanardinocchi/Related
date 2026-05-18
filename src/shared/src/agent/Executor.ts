import type { SupabaseClient } from "@supabase/supabase-js";

export interface PendingCandidateAction {
  id: string;
  candidateSetId: string;
  ownerId: string;
  type: string;
  payload?: unknown;
}

export interface UserEdits {
  payload?: unknown;
  why?: string;
}

export type EffectResult =
  | {
      kind: "picked";
      actionId: string;
    }
  | {
      kind: "declined";
      actionId: string;
    };

export interface ExecuteInput {
  action: PendingCandidateAction;
  userEdits?: UserEdits;
}

export interface TriggeredPassScheduler {
  (input: { relationshipId: string; reason: string }): Promise<void>;
}

export interface ExecutorOptions {
  supabase: SupabaseClient;
  scheduleTriggeredPass: TriggeredPassScheduler;
}

/**
 * Candidate Action Executor — applies the User's decision to a Candidate
 * Action and schedules a Triggered Pass so the agent reacts to the new
 * state on the next loop. Slice 7 implements only `DoNothing`: record the
 * decline, kick off a Triggered Pass. Real action types arrive in later
 * slices (SendMessage, OpenThread, CloseThread, etc).
 */
export class Executor {
  private readonly supabase: SupabaseClient;
  private readonly scheduleTriggeredPass: TriggeredPassScheduler;

  constructor(opts: ExecutorOptions) {
    this.supabase = opts.supabase;
    this.scheduleTriggeredPass = opts.scheduleTriggeredPass;
  }

  async execute(input: ExecuteInput): Promise<EffectResult> {
    const { action, userEdits } = input;

    if (action.type !== "DoNothing") {
      throw new Error(
        `Executor: action type '${action.type}' not implemented in this slice`,
      );
    }

    // DoNothing is recorded as a `declined` decision — the User has
    // implicitly accepted "no proposed Candidate Action this Pass."
    const update: Record<string, unknown> = {
      decision_state: "declined",
      decided_at: new Date().toISOString(),
    };
    if (userEdits?.payload !== undefined) update.payload = userEdits.payload;
    if (userEdits?.why !== undefined) update.why = userEdits.why;

    const { error: updErr } = await this.supabase
      .from("candidate_actions")
      .update(update)
      .eq("id", action.id)
      .select()
      .single();
    if (updErr) throw updErr;

    const { data: setRow, error: setErr } = await this.supabase
      .from("candidate_sets")
      .select("id, relationship_id")
      .eq("id", action.candidateSetId)
      .single();
    if (setErr || !setRow) throw setErr ?? new Error("candidate set not found");

    await this.scheduleTriggeredPass({
      relationshipId: (setRow as { relationship_id: string }).relationship_id,
      reason: "candidate_decision",
    });

    return { kind: "declined", actionId: action.id };
  }
}
