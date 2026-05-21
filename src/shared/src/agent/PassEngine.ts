import type { SupabaseClient } from "@supabase/supabase-js";
import {
  UserContextBuilder,
  type UserContextSnapshot,
} from "./UserContextBuilder";
import type { NotificationDispatcher } from "../notifications/NotificationDispatcher";

export type PassMode = "baseline" | "triggered" | "engaged";

export interface CandidateActionInput {
  type: string;
  payload?: unknown;
  why?: string;
}

export interface CandidateSet {
  id: string;
  ownerId: string;
  relationshipId: string;
  mode: PassMode;
  createdAt: string;
  actions: CandidateActionInput[];
}

export type DecisionState = "pending" | "picked" | "declined" | "ignored";

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

export interface AgentPrompt {
  mode: PassMode;
  relationship: unknown;
  openThreads: unknown[];
  previousCandidateSet: PreviousCandidateSet | null;
  userContext: UserContextSnapshot;
  /**
   * Per-Relationship narrative written by the Extraction Pass (or edited
   * directly by the User). Null when no Relationship Context exists yet
   * for this Relationship. Per the ADR-0009 2026-05-21 amendment, the
   * next Pass reads this alongside User Context.
   */
  relationshipContext: string | null;
  liveContext?: unknown;
}

/**
 * The pluggable LLM call. Slice 7 ships a trivial stub that always returns
 * `[DoNothing]`; later slices implement the real Claude call.
 */
export interface AgentCaller {
  propose(prompt: AgentPrompt): Promise<CandidateActionInput[]>;
}

export interface PassEngineOptions {
  supabase: SupabaseClient;
  agent: AgentCaller;
  userContextBuilder?: UserContextBuilder;
  /**
   * Slice 15 trigger. When set, the engine calls dispatcher.maybeDispatch
   * after persisting a baseline/triggered Pass that produced at least one
   * non-DoNothing candidate. Engaged Passes never notify — the User is in
   * the agent UI already.
   */
  dispatcher?: NotificationDispatcher;
}

export interface RunPassInput {
  relationshipId: string;
  mode: PassMode;
  /** Engaged-Pass-only live context (Transient Intent etc.); Slice 14 wires this. */
  liveContext?: unknown;
}

/**
 * Agent Pass Engine — ADR-0001. Loads the Relationship's current state +
 * Open Threads + previous Candidate Set + User Context, calls the agent,
 * persists a new Candidate Set replacing the previous, and returns it.
 *
 * The Claude call is abstracted behind `AgentCaller` so tests can pin the
 * input shape without a real LLM. In Slice 7, the stub always returns
 * `[DoNothing]`; the structural contract is what matters.
 */
export class PassEngine {
  private readonly supabase: SupabaseClient;
  private readonly agent: AgentCaller;
  private readonly userContextBuilder: UserContextBuilder;
  private readonly dispatcher: NotificationDispatcher | null;

  constructor(opts: PassEngineOptions) {
    this.supabase = opts.supabase;
    this.agent = opts.agent;
    this.userContextBuilder = opts.userContextBuilder ?? new UserContextBuilder();
    this.dispatcher = opts.dispatcher ?? null;
  }

  async runPass(input: RunPassInput): Promise<CandidateSet> {
    const { relationshipId, mode, liveContext } = input;

    const { data: relationship, error: relErr } = await this.supabase
      .from("relationships")
      .select(
        "id, owner_id, target_type, target_contact_id, target_group_id, contact:contacts(id, name), group:groups(id, name)",
      )
      .eq("id", relationshipId)
      .single();
    if (relErr || !relationship) {
      throw relErr ?? new Error(`relationship ${relationshipId} not found`);
    }
    const ownerId = (relationship as { owner_id: string }).owner_id;

    const { data: previousSetRows } = await this.supabase
      .from("candidate_sets")
      .select("id, mode")
      .eq("relationship_id", relationshipId)
      .order("created_at", { ascending: false })
      .limit(1);
    const previousSetRow =
      ((previousSetRows ?? []) as { id: string; mode: PassMode }[])[0] ?? null;

    let previousCandidateSet: PreviousCandidateSet | null = null;
    if (previousSetRow) {
      const { data: actionRows, error: actionsErr } = await this.supabase
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

    const { data: openThreads } = await this.supabase
      .from("open_thread_relationships")
      .select("open_threads(id, description, direction, created_at)")
      .eq("relationship_id", relationshipId)
      .order("open_threads(created_at)", { ascending: true })
      .limit(50);

    const { data: relContextRow } = await this.supabase
      .from("relationship_context")
      .select("content")
      .eq("relationship_id", relationshipId)
      .maybeSingle();
    const relationshipContext =
      (relContextRow as { content: string } | null)?.content ?? null;

    // Engaged-Pass live context carries the voice session id so the
    // builder can pull non-expired Transient Intent for that session.
    // Other modes leave transientIntent empty by design.
    const live = liveContext as { sessionId?: string } | undefined;
    const userContext = await this.userContextBuilder.buildUserContext(
      ownerId,
      new Date(),
      { mode, sessionId: live?.sessionId },
    );

    const prompt: AgentPrompt = {
      mode,
      relationship,
      openThreads: openThreads ?? [],
      previousCandidateSet,
      userContext,
      relationshipContext,
      liveContext,
    };
    const actions = await this.agent.propose(prompt);

    const { data: newSet, error: setErr } = await this.supabase
      .from("candidate_sets")
      .insert({ owner_id: ownerId, relationship_id: relationshipId, mode })
      .select()
      .single();
    if (setErr || !newSet) throw setErr ?? new Error("failed to persist candidate set");
    const persistedSet = newSet as {
      id: string;
      owner_id: string;
      relationship_id: string;
      mode: PassMode;
      created_at: string;
    };

    if (actions.length > 0) {
      const { error: actErr } = await this.supabase
        .from("candidate_actions")
        .insert(
          actions.map((a) => ({
            owner_id: ownerId,
            candidate_set_id: persistedSet.id,
            type: a.type,
            payload: a.payload ?? null,
            why: a.why ?? null,
          })),
        );
      if (actErr) throw actErr;
    }

    // Slice 15 notification trigger. Skip engaged-mode Passes — the User
    // is already in the agent UI. Skip when the only candidate is DoNothing
    // — nothing fresh to notify about. The dispatcher itself enforces
    // quiet hours and the salience threshold; here we just compute a
    // heuristic salience and synthesise a title.
    if (this.dispatcher && mode !== "engaged") {
      const concrete = actions.filter((a) => a.type !== "DoNothing");
      if (concrete.length > 0) {
        const contactName = (
          relationship as { contact?: { name?: string } | null }
        )?.contact?.name;
        const firstWithWhy = concrete.find((a) => a.why);
        const salience = firstWithWhy ? 1.0 : 0.6;
        await this.dispatcher.maybeDispatch({
          ownerId,
          relationshipId,
          candidateActionId: persistedSet.id,
          salience,
          title: `Fresh thinking${contactName ? ` for ${contactName}` : ""}`,
          body:
            concrete.length === 1
              ? `1 new option to review`
              : `${concrete.length} new options to review`,
          now: new Date(),
        });
      }
    }

    return {
      id: persistedSet.id,
      ownerId: persistedSet.owner_id,
      relationshipId: persistedSet.relationship_id,
      // Trust the input mode rather than echoing the persisted row — the
      // insert was scoped to this mode, and tests can mock the persisted
      // row without re-encoding it.
      mode,
      createdAt: persistedSet.created_at,
      actions,
    };
  }
}

/**
 * Slice 7 trivial agent. Returns a single DoNothing candidate regardless of
 * the prompt content. Replace in Slice 8 when the real ontology lands.
 */
export class DoNothingAgent implements AgentCaller {
  async propose(_prompt: AgentPrompt): Promise<CandidateActionInput[]> {
    return [
      {
        type: "DoNothing",
        why: "no changes warrant a Candidate Action this Pass",
      },
    ];
  }
}
