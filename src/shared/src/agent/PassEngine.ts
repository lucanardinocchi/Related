import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureDoNothingPeer } from "./ambientTools";
import { initialDecisionStateForCandidateAction } from "../candidates/candidateSet";
import {
  UserContextBuilder,
  type UserContextSnapshot,
} from "./UserContextBuilder";
import {
  RelationshipContextBuilder,
  type RelationshipContextSnapshot,
} from "./RelationshipContextBuilder";
import type { NotificationDispatcher } from "../notifications/NotificationDispatcher";
import type {
  CandidateActionInput,
  DecisionState,
  PassCandidateSet,
  PassMode,
  PreviousCandidateSet,
} from "../candidates/candidateSet";

export type { RelationshipContextSnapshot } from "./RelationshipContextBuilder";
export type {
  CandidateActionInput,
  DecisionState,
  PassCandidateSet,
  PassMode,
  PreviousCandidateAction,
  PreviousCandidateSet,
} from "../candidates/candidateSet";

export interface AgentPrompt {
  mode: PassMode;
  relationshipContext: RelationshipContextSnapshot;
  previousCandidateSet: PreviousCandidateSet | null;
  userContext: UserContextSnapshot;
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
  relationshipContextBuilder?: RelationshipContextBuilder;
  /**
   * Slice 15 trigger. When set, the engine calls dispatcher.maybeDispatch
   * after persisting a baseline/triggered Pass that produced at least one
   * non-DoNothing candidate.
   */
  dispatcher?: NotificationDispatcher;
}

export interface RunPassInput {
  relationshipId: string;
  mode: PassMode;
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
  private readonly relationshipContextBuilder: RelationshipContextBuilder;
  private readonly dispatcher: NotificationDispatcher | null;

  constructor(opts: PassEngineOptions) {
    this.supabase = opts.supabase;
    this.agent = opts.agent;
    this.userContextBuilder =
      opts.userContextBuilder ?? new UserContextBuilder({ supabase: opts.supabase });
    this.relationshipContextBuilder =
      opts.relationshipContextBuilder ??
      new RelationshipContextBuilder({ supabase: opts.supabase });
    this.dispatcher = opts.dispatcher ?? null;
  }

  async runPass(input: RunPassInput): Promise<PassCandidateSet> {
    const { relationshipId, mode } = input;

    const relationshipContext =
      await this.relationshipContextBuilder.buildRelationshipContext(
        relationshipId,
      );
    const { relationship } = relationshipContext;
    const ownerId = relationship.owner_id;
    if (!ownerId) {
      throw new Error(
        `relationship ${relationshipId} is missing owner_id in context snapshot`,
      );
    }

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

    const userContext = await this.userContextBuilder.buildUserContext(
      ownerId,
      new Date(),
    );

    const prompt: AgentPrompt = {
      mode,
      relationshipContext,
      previousCandidateSet,
      userContext,
    };
    const actions = ensureDoNothingPeer(await this.agent.propose(prompt));

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
            decision_state: initialDecisionStateForCandidateAction(a.type),
          })),
        );
      if (actErr) throw actErr;
    }

    // Slice 15 notification trigger. Skip when the only candidate is DoNothing
    // — nothing fresh to notify about. The dispatcher itself enforces
    // quiet hours and the salience threshold; here we just compute a
    // heuristic salience and synthesise a title.
    if (this.dispatcher) {
      const concrete = actions.filter((a) => a.type !== "DoNothing");
      if (concrete.length > 0) {
        const contactName = relationship.contact?.name;
        const groupName = relationship.group?.name;
        const targetName =
          relationship.target_type === "group" ? groupName : contactName;
        const firstWithWhy = concrete.find((a) => a.why);
        const salience = firstWithWhy ? 1.0 : 0.6;
        await this.dispatcher.maybeDispatch({
          ownerId,
          relationshipId,
          candidateActionId: persistedSet.id,
          salience,
          title: `Fresh thinking${targetName ? ` for ${targetName}` : ""}`,
          body: `1 new option to review`,
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
