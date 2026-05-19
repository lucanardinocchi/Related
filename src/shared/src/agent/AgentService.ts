import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EdgeFunctionAgentCaller,
  type EdgeFunctionAgentCallerOptions,
} from "./EdgeFunctionAgentCaller";
import {
  Executor,
  type ExecuteInput,
  type EffectResult,
  type MessageComposer,
  type TriggeredPassScheduler,
} from "./Executor";
import {
  PassEngine,
  type AgentCaller,
  type CandidateSet,
} from "./PassEngine";
import { UserContextBuilder } from "./UserContextBuilder";

export interface AgentServiceOptions {
  supabase: SupabaseClient;
  /**
   * Override for tests / non-default function names. Defaults to a real
   * EdgeFunctionAgentCaller against `engaged-pass`.
   */
  agent?: AgentCaller;
  /** Override the Edge Function name without writing a custom AgentCaller. */
  functionName?: EdgeFunctionAgentCallerOptions["functionName"];
  /**
   * Override the User Context builder. Default reads from supabase tables;
   * tests can pass a stub that returns the empty snapshot.
   */
  userContextBuilder?: UserContextBuilder;
  messageComposer?: MessageComposer;
  /**
   * Triggered Pass dispatcher. Defaults to a no-op — the scheduler infra
   * (pg_cron / NOTIFY) lands in a future slice; the Executor still records
   * the decision and the next user-initiated Pass picks up the new state.
   */
  scheduleTriggeredPass?: TriggeredPassScheduler;
}

export interface RunEngagedTurnInput {
  relationshipId: string;
  userTurn: string;
  sessionId: string;
}

/**
 * Convenience wrapper around PassEngine + ClaudeAgent (via Edge Function) +
 * Executor. The frontend AgentScreen calls into here for both halves of the
 * loop: run a Pass (server-side LLM call), then execute the user's pick.
 */
export class AgentService {
  private readonly engine: PassEngine;
  private readonly executor: Executor;

  constructor(opts: AgentServiceOptions) {
    const agent =
      opts.agent ??
      new EdgeFunctionAgentCaller({
        supabase: opts.supabase,
        functionName: opts.functionName,
      });
    this.engine = new PassEngine({
      supabase: opts.supabase,
      agent,
      userContextBuilder:
        opts.userContextBuilder ??
        new UserContextBuilder({ supabase: opts.supabase }),
    });
    this.executor = new Executor({
      supabase: opts.supabase,
      scheduleTriggeredPass:
        opts.scheduleTriggeredPass ?? (async () => undefined),
      messageComposer: opts.messageComposer,
    });
  }

  async runEngagedTurn(input: RunEngagedTurnInput): Promise<CandidateSet> {
    return this.engine.runPass({
      relationshipId: input.relationshipId,
      mode: "engaged",
      liveContext: {
        sessionId: input.sessionId,
        userTurn: input.userTurn,
      },
    });
  }

  async executeAction(input: ExecuteInput): Promise<EffectResult> {
    return this.executor.execute(input);
  }
}
