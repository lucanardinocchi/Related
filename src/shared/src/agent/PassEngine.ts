import type { SupabaseClient } from "@supabase/supabase-js";
import {
  UserContextBuilder,
  type UserContextSnapshot,
} from "./UserContextBuilder";

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

export interface AgentPrompt {
  mode: PassMode;
  relationship: unknown;
  openThreads: unknown[];
  previousCandidateSet: { id: string; mode: PassMode } | null;
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

  constructor(opts: PassEngineOptions) {
    this.supabase = opts.supabase;
    this.agent = opts.agent;
    this.userContextBuilder = opts.userContextBuilder ?? new UserContextBuilder();
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
    const previousCandidateSet =
      ((previousSetRows ?? []) as { id: string; mode: PassMode }[])[0] ?? null;

    const { data: openThreads } = await this.supabase
      .from("open_thread_relationships")
      .select("open_threads(id, description, direction, created_at)")
      .eq("relationship_id", relationshipId)
      .order("open_threads(created_at)", { ascending: true })
      .limit(50);

    const userContext = await this.userContextBuilder.buildUserContext(
      ownerId,
      new Date(),
    );

    const prompt: AgentPrompt = {
      mode,
      relationship,
      openThreads: openThreads ?? [],
      previousCandidateSet,
      userContext,
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
