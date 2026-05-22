import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Executor,
  type EffectResult,
  type MessageComposer,
  type TriggeredPassScheduler,
  type UserEdits,
} from "./Executor";
import { createDefaultTriggeredPassScheduler } from "./TriggeredPassScheduler";

export interface AgentServiceOptions {
  supabase: SupabaseClient;
  messageComposer?: MessageComposer;
  /**
   * Triggered Pass dispatcher. Defaults to `schedule_triggered_pass` RPC
   * (enqueue on `scheduled_passes`). Override in tests.
   */
  scheduleTriggeredPass?: TriggeredPassScheduler;
}

/** UI-facing input for accepting or declining a Candidate Action. */
export interface CandidateDecisionInput {
  candidateSetId: string;
  action: {
    id: string;
    type: string;
    payload?: unknown;
  };
  userEdits?: UserEdits;
}

/**
 * Application seam for Candidate Action decisions from agent UI surfaces.
 * Validates input, routes declines through DoNothing, and delegates side
 * effects to Executor (record decision, schedule Triggered Pass, etc.).
 *
 * Ambient Intelligence Passes (baseline and triggered) run server-side via
 * `scheduled_passes`; this service handles User accept/decline only.
 */
export class AgentService {
  private readonly executor: Executor;

  constructor(opts: AgentServiceOptions) {
    this.executor = new Executor({
      supabase: opts.supabase,
      scheduleTriggeredPass:
        opts.scheduleTriggeredPass ??
        createDefaultTriggeredPassScheduler(opts.supabase),
      messageComposer: opts.messageComposer,
    });
  }

  async acceptAction(input: CandidateDecisionInput): Promise<EffectResult> {
    this.assertDecisionInput(input);
    return this.executor.execute({
      action: {
        id: input.action.id,
        candidateSetId: input.candidateSetId,
        ownerId: "",
        type: input.action.type,
        payload: input.action.payload,
      },
      userEdits: input.userEdits,
    });
  }

  async declineAction(input: CandidateDecisionInput): Promise<EffectResult> {
    this.assertDecisionInput(input);
    return this.executor.execute({
      action: {
        id: input.action.id,
        candidateSetId: input.candidateSetId,
        ownerId: "",
        type: "DoNothing",
        payload: {},
      },
      userEdits: input.userEdits,
    });
  }

  private assertDecisionInput(input: CandidateDecisionInput): void {
    if (!input.candidateSetId.trim()) {
      throw new Error("AgentService: candidateSetId is required");
    }
    if (!input.action.id.trim()) {
      throw new Error("AgentService: action.id is required");
    }
    if (!input.action.type.trim()) {
      throw new Error("AgentService: action.type is required");
    }
  }
}
