import type { SupabaseClient } from "@supabase/supabase-js";
import {
  runAgentPass,
  type AgentCaller,
  type AgentPrompt,
  type RunPassInput,
} from "./agentPassRun";
import type { UserContextSnapshot } from "./userContextCore";
import { assembleUserContextForAmbientPass } from "./userContextProjections";
import { RelationshipContextBuilder } from "./RelationshipContextBuilder";
import type { NotificationDispatcher } from "../notifications/NotificationDispatcher";
import type { CandidateActionInput, PassCandidateSet } from "../candidates/candidateSet";

export type { AgentCaller, AgentPrompt, RunPassInput } from "./agentPassRun";
export type { RelationshipContextSnapshot } from "./RelationshipContextBuilder";
export type {
  CandidateActionInput,
  DecisionState,
  PassCandidateSet,
  PassMode,
  PreviousCandidateAction,
  PreviousCandidateSet,
} from "../candidates/candidateSet";

export interface PassEngineOptions {
  supabase: SupabaseClient;
  agent: AgentCaller;
  buildUserContext?: (
    userId: string,
    asOf: Date,
    relationshipId: string,
  ) => Promise<UserContextSnapshot>;
  relationshipContextBuilder?: RelationshipContextBuilder;
  dispatcher?: NotificationDispatcher;
}

/** Agent Pass Engine — ADR-0001. Thin Module wrapper around `runAgentPass`. */
export class PassEngine {
  private readonly supabase: SupabaseClient;
  private readonly agent: AgentCaller;
  private readonly buildUserContext: (
    userId: string,
    asOf: Date,
    relationshipId: string,
  ) => Promise<UserContextSnapshot>;
  private readonly relationshipContextBuilder: RelationshipContextBuilder;
  private readonly dispatcher: NotificationDispatcher | null;

  constructor(opts: PassEngineOptions) {
    this.supabase = opts.supabase;
    this.agent = opts.agent;
    this.buildUserContext =
      opts.buildUserContext ??
      ((userId, asOf, relationshipId) =>
        assembleUserContextForAmbientPass(this.supabase, {
          userId,
          asOf,
          excludeRelationshipId: relationshipId,
        }));
    this.relationshipContextBuilder =
      opts.relationshipContextBuilder ??
      new RelationshipContextBuilder({ supabase: opts.supabase });
    this.dispatcher = opts.dispatcher ?? null;
  }

  async runPass(input: RunPassInput): Promise<PassCandidateSet> {
    return runAgentPass(
      {
        supabase: this.supabase,
        agent: this.agent,
        buildRelationshipContext: (relationshipId) =>
          this.relationshipContextBuilder.buildRelationshipContext(relationshipId),
        buildUserContext: (userId, asOf, relationshipId) =>
          this.buildUserContext(userId, asOf, relationshipId),
        dispatcher: this.dispatcher,
      },
      input,
    );
  }
}

export class DoNothingAgent implements AgentCaller {
  async propose(_prompt: AgentPrompt): Promise<CandidateActionInput[]> {
    return [{ type: "DoNothing", why: "no changes warrant a Candidate Action this Pass" }];
  }
}
