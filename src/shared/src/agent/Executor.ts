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

export interface SendMessagePayload extends MessageComposerInput {
  /**
   * Contact ids the auto-logged Interaction is linked to. Sourced from
   * the agent's proposal (one entry per recipient Contact in the User's
   * address book); the User can add/remove via edit-before-accept.
   */
  contactIds: string[];
}

export interface ScheduleInteractionPayload {
  time: string;
  kind: string;
  notes?: string;
  contactIds: string[];
}

export interface LogInteractionPayload {
  time: string;
  kind: string;
  notes?: string;
  contactIds: string[];
}

export interface OpenThreadPayload {
  description: string;
  direction: "me_owes_them" | "they_owe_me";
  /** Defaults to the candidate's parent Relationship; can be expanded to span multiple. */
  relationshipIds?: string[];
}

export interface CloseThreadPayload {
  openThreadId: string;
}

export interface UpdateRoleOrCadencePayload {
  role?: string;
  cadence?: string;
}

export interface ExecutorOptions {
  supabase: SupabaseClient;
  scheduleTriggeredPass: TriggeredPassScheduler;
  /** Required to execute SendMessage actions; optional for DoNothing-only flows. */
  messageComposer?: MessageComposer;
}

/**
 * Candidate Action Executor — applies the User's decision to a Candidate
 * Action and schedules a Triggered Pass so the agent reacts to the new
 * state on the next loop.
 *
 * Slice 7: DoNothing only.
 * Slice 9: + SendMessage (text / email via injected composer + auto-log
 *   of `occurred` Interaction).
 *
 * Later slices fill in ScheduleInteraction / LogInteraction / OpenThread /
 * CloseThread / UpdateRoleOrCadence.
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

    switch (action.type) {
      case "DoNothing":
        return this.executeDoNothing(action, userEdits);
      case "SendMessage":
        return this.executeSendMessage(action, userEdits);
      case "ScheduleInteraction":
        return this.executeCreateInteraction(action, userEdits, "planned");
      case "LogInteraction":
        return this.executeCreateInteraction(action, userEdits, "occurred");
      case "OpenThread":
        return this.executeOpenThread(action, userEdits);
      case "CloseThread":
        return this.executeCloseThread(action, userEdits);
      case "UpdateRoleOrCadence":
        return this.executeUpdateRoleOrCadence(action, userEdits);
      default:
        throw new Error(
          `Executor: action type '${action.type}' not implemented in this slice`,
        );
    }
  }

  private async executeCloseThread(
    action: PendingCandidateAction,
    userEdits: UserEdits | undefined,
  ): Promise<EffectResult> {
    const merged = {
      ...(action.payload as CloseThreadPayload),
      ...((userEdits?.payload as Partial<CloseThreadPayload>) ?? {}),
    } as CloseThreadPayload;

    const { error: closeErr } = await this.supabase
      .from("open_threads")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", merged.openThreadId)
      .select()
      .single();
    if (closeErr) throw closeErr;

    await this.recordDecision(action.id, "picked", {
      payload: merged,
      why: userEdits?.why,
    });
    const relationshipId = await this.relationshipIdForSet(action.candidateSetId);
    await this.scheduleTriggeredPass({
      relationshipId,
      reason: "candidate_decision",
    });
    return { kind: "picked", actionId: action.id };
  }

  private async executeUpdateRoleOrCadence(
    action: PendingCandidateAction,
    userEdits: UserEdits | undefined,
  ): Promise<EffectResult> {
    const merged = {
      ...(action.payload as UpdateRoleOrCadencePayload),
      ...((userEdits?.payload as Partial<UpdateRoleOrCadencePayload>) ?? {}),
    } as UpdateRoleOrCadencePayload;

    const update: Record<string, unknown> = {};
    if (merged.role !== undefined) update.role = merged.role;
    if (merged.cadence !== undefined) update.cadence = merged.cadence;

    const relationshipId = await this.relationshipIdForSet(action.candidateSetId);
    const { error: updErr } = await this.supabase
      .from("relationships")
      .update(update)
      .eq("id", relationshipId)
      .select()
      .single();
    if (updErr) throw updErr;

    await this.recordDecision(action.id, "picked", {
      payload: merged,
      why: userEdits?.why,
    });
    await this.scheduleTriggeredPass({
      relationshipId,
      reason: "candidate_decision",
    });
    return { kind: "picked", actionId: action.id };
  }

  private async executeOpenThread(
    action: PendingCandidateAction,
    userEdits: UserEdits | undefined,
  ): Promise<EffectResult> {
    const merged = {
      ...(action.payload as OpenThreadPayload),
      ...((userEdits?.payload as Partial<OpenThreadPayload>) ?? {}),
    } as OpenThreadPayload;

    // The agent's payload omits relationshipIds when the Open Thread is
    // scoped to the parent Relationship (the common case). Resolve it
    // upfront so the RPC has what it needs.
    const relationshipId = await this.relationshipIdForSet(action.candidateSetId);
    const relationshipIds =
      merged.relationshipIds && merged.relationshipIds.length > 0
        ? merged.relationshipIds
        : [relationshipId];

    const { error: rpcErr } = await (
      this.supabase as unknown as {
        rpc: (
          fn: string,
          args: unknown,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc("create_open_thread", {
      p_description: merged.description,
      p_direction: merged.direction,
      p_relationship_ids: relationshipIds,
    });
    if (rpcErr) throw rpcErr;

    await this.recordDecision(action.id, "picked", {
      payload: merged,
      why: userEdits?.why,
    });
    await this.scheduleTriggeredPass({
      relationshipId,
      reason: "candidate_decision",
    });
    return { kind: "picked", actionId: action.id };
  }

  private async executeCreateInteraction(
    action: PendingCandidateAction,
    userEdits: UserEdits | undefined,
    status: "planned" | "occurred",
  ): Promise<EffectResult> {
    const merged = {
      ...(action.payload as ScheduleInteractionPayload | LogInteractionPayload),
      ...((userEdits?.payload as Partial<ScheduleInteractionPayload>) ?? {}),
    } as ScheduleInteractionPayload | LogInteractionPayload;

    const { data: interactionId, error: rpcErr } = await (
      this.supabase as unknown as {
        rpc: (
          fn: string,
          args: unknown,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc("create_interaction", {
      p_time: merged.time,
      p_kind: merged.kind,
      p_notes: merged.notes ?? null,
      p_status: status,
      p_contact_ids: merged.contactIds,
    });
    if (rpcErr) throw rpcErr;

    await this.recordDecision(action.id, "picked", {
      payload: merged,
      why: userEdits?.why,
    });
    const relationshipId = await this.relationshipIdForSet(action.candidateSetId);
    await this.scheduleTriggeredPass({
      relationshipId,
      reason: "candidate_decision",
    });
    return {
      kind: "picked",
      actionId: action.id,
      effects: { interactionId: (interactionId as string) ?? undefined },
    };
  }

  private async executeDoNothing(
    action: PendingCandidateAction,
    userEdits: UserEdits | undefined,
  ): Promise<EffectResult> {
    await this.recordDecision(action.id, "declined", userEdits);
    const relationshipId = await this.relationshipIdForSet(action.candidateSetId);
    await this.scheduleTriggeredPass({
      relationshipId,
      reason: "candidate_decision",
    });
    return { kind: "declined", actionId: action.id };
  }

  private async executeSendMessage(
    action: PendingCandidateAction,
    userEdits: UserEdits | undefined,
  ): Promise<EffectResult> {
    if (!this.messageComposer) {
      throw new Error(
        "Executor: SendMessage requires a MessageComposer in ExecutorOptions",
      );
    }
    const merged = {
      ...(action.payload as SendMessagePayload),
      ...((userEdits?.payload as Partial<SendMessagePayload>) ?? {}),
    } as SendMessagePayload;

    // 1) Open the system composer pre-filled. The send itself happens in
    //    the system UI and isn't reliably observable from inside the app
    //    (best-effort per the slice brief), so the Interaction is logged
    //    on User accept rather than on detected send.
    await this.messageComposer.compose({
      channel: merged.channel,
      to: merged.to,
      subject: merged.subject,
      body: merged.body,
    });

    // 2) Record the decision.
    await this.recordDecision(action.id, "picked", {
      payload: merged,
      why: userEdits?.why,
    });

    // 3) Auto-log an `occurred` Interaction. kind mirrors the channel
    //    (text | email), linked to the recipient Contact(s).
    const { data: interactionId, error: logErr } = await (
      this.supabase as unknown as {
        rpc: (
          fn: string,
          args: unknown,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc("create_interaction", {
      p_time: new Date().toISOString(),
      p_kind: merged.channel,
      p_notes: merged.body,
      p_status: "occurred",
      p_contact_ids: merged.contactIds,
    });
    if (logErr) throw logErr;

    // 4) Schedule a Triggered Pass so the agent sees the new Interaction.
    const relationshipId = await this.relationshipIdForSet(action.candidateSetId);
    await this.scheduleTriggeredPass({
      relationshipId,
      reason: "candidate_decision",
    });

    return {
      kind: "picked",
      actionId: action.id,
      effects: { interactionId: (interactionId as string) ?? undefined },
    };
  }

  private async recordDecision(
    actionId: string,
    decisionState: "picked" | "declined" | "ignored",
    userEdits: UserEdits | undefined,
  ): Promise<void> {
    const update: Record<string, unknown> = {
      decision_state: decisionState,
      decided_at: new Date().toISOString(),
    };
    if (userEdits?.payload !== undefined) update.payload = userEdits.payload;
    if (userEdits?.why !== undefined) update.why = userEdits.why;

    const { error } = await this.supabase
      .from("candidate_actions")
      .update(update)
      .eq("id", actionId)
      .select()
      .single();
    if (error) throw error;
  }

  private async relationshipIdForSet(candidateSetId: string): Promise<string> {
    const { data: row, error } = await this.supabase
      .from("candidate_sets")
      .select("id, relationship_id")
      .eq("id", candidateSetId)
      .single();
    if (error || !row) throw error ?? new Error("candidate set not found");
    return (row as { relationship_id: string }).relationship_id;
  }
}
