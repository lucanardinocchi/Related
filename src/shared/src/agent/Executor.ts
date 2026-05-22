import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CloseThreadPayload,
  LogInteractionPayload,
  OpenThreadToolPayload,
  ScheduleInteractionPayload,
  SendMessageToolPayload,
  UpdateRoleOrCadencePayload,
} from "./ambientTools";
import { getActionHandler } from "./executor/registry";
import { recordDecision } from "./executor/recordDecision";
import { relationshipIdForSet } from "./executor/relationshipLookup";

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
      effects?: { interactionId?: string };
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

/**
 * SendMessage composer adapter. Implementations open the host system's
 * messaging surface (iOS Messages, Android SMS / Mail intent, browser
 * sms: / mailto: handler). The adapter is injected so the Executor stays
 * platform-agnostic and unit-testable.
 */
export interface MessageComposerInput {
  channel: "text" | "email";
  to: string[];
  subject?: string;
  body: string;
}

export interface MessageComposer {
  compose(input: MessageComposerInput): Promise<void>;
}

export interface SendMessagePayload extends SendMessageToolPayload {
  /** Resolved recipient addresses for the system composer. */
  to?: string[];
}

export type { ScheduleInteractionPayload, LogInteractionPayload, CloseThreadPayload, UpdateRoleOrCadencePayload };

export interface OpenThreadPayload extends OpenThreadToolPayload {
  /** Defaults to the candidate's parent Relationship; can be expanded to span multiple. */
  relationshipIds?: string[];
}

export interface ExecutorOptions {
  supabase: SupabaseClient;
  scheduleTriggeredPass: TriggeredPassScheduler;
  /** Required to execute SendMessage actions; optional for DoNothing-only flows. */
  messageComposer?: MessageComposer;
}

/**
 * Candidate Action Executor — validates the action, dispatches to a
 * per-type handler, records the User's decision, and schedules a
 * Triggered Pass so the agent reacts on the next loop.
 */
export class Executor {
  private readonly supabase: SupabaseClient;
  private readonly scheduleTriggeredPass: TriggeredPassScheduler;
  private readonly messageComposer?: MessageComposer;

  constructor(opts: ExecutorOptions) {
    this.supabase = opts.supabase;
    this.scheduleTriggeredPass = opts.scheduleTriggeredPass;
    this.messageComposer = opts.messageComposer;
  }

  async execute(input: ExecuteInput): Promise<EffectResult> {
    const { action, userEdits } = input;
    const handler = getActionHandler(action.type);
    if (!handler) {
      throw new Error(
        `Executor: action type '${action.type}' not implemented in this slice`,
      );
    }

    const relationshipId = await relationshipIdForSet(
      this.supabase,
      action.candidateSetId,
    );

    const outcome = await handler(
      action,
      userEdits,
      { supabase: this.supabase, messageComposer: this.messageComposer },
      relationshipId,
    );

    const recordEdits: UserEdits | undefined =
      outcome.decisionState === "declined"
        ? userEdits
        : { payload: outcome.mergedPayload, why: userEdits?.why };

    await recordDecision(
      this.supabase,
      action.id,
      outcome.decisionState,
      recordEdits,
    );

    await this.scheduleTriggeredPass({
      relationshipId,
      reason: "candidate_decision",
    });

    if (outcome.decisionState === "declined") {
      return { kind: "declined", actionId: action.id };
    }

    return {
      kind: "picked",
      actionId: action.id,
      effects: outcome.effects,
    };
  }
}
