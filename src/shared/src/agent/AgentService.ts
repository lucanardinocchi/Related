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
import { createDefaultTriggeredPassScheduler } from "./TriggeredPassScheduler";
import {
  PassEngine,
  type AgentCaller,
  type CandidateSet,
} from "./PassEngine";
import { UserContextBuilder } from "./UserContextBuilder";
import {
  defaultIntentDetector,
  extractTransientIntent,
  type ExtractResult as IntentExtractResult,
  type IntentDetector,
  type TransientIntentWriter,
} from "../user-context/transientIntent";

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
   * Triggered Pass dispatcher. Defaults to `schedule_triggered_pass` RPC
   * (enqueue on `scheduled_passes`). Override in tests.
   */
  scheduleTriggeredPass?: TriggeredPassScheduler;
  /**
   * Detector for Transient Intent capture. Defaults to the rule-based
   * `defaultIntentDetector`. Slice 13/14 will swap in an LLM-tool extractor
   * behind the same interface.
   */
  intentDetector?: IntentDetector;
  /** How long captured intent stays salient. Default: 30 minutes. */
  intentExpiresInMs?: number;
}

export interface RunEngagedTurnInput {
  relationshipId: string;
  userTurn: string;
  sessionId: string;
}

export interface CaptureIntentInput {
  userTurn: string;
  sessionId: string;
  relationshipId?: string;
}

/**
 * Convenience wrapper around PassEngine + ClaudeAgent (via Edge Function) +
 * Executor. The mobile AgentScreen calls into here for both halves of the
 * loop: run a Pass (server-side LLM call), then execute the user's pick.
 */
export class AgentService {
  private readonly supabase: SupabaseClient;
  private readonly engine: PassEngine;
  private readonly executor: Executor;
  private readonly intentDetector: IntentDetector;
  private readonly intentExpiresInMs: number;

  constructor(opts: AgentServiceOptions) {
    this.supabase = opts.supabase;
    this.intentDetector = opts.intentDetector ?? defaultIntentDetector;
    this.intentExpiresInMs = opts.intentExpiresInMs ?? 30 * 60_000;

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
        opts.scheduleTriggeredPass ??
        createDefaultTriggeredPassScheduler(opts.supabase),
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

  /**
   * Captures Transient Intent from a User turn. Called by AgentScreen
   * before runEngagedTurn so the just-written intent is included in the
   * UserContext snapshot for the same Pass.
   *
   * The detector runs locally (rule-based) — no Edge Function call. The
   * extracted intent is written to `transient_intent` with an expiry so
   * it decays naturally if the session ends.
   */
  async captureIntentForTurn(
    input: CaptureIntentInput,
  ): Promise<IntentExtractResult> {
    const write: TransientIntentWriter = async (record) => {
      const { error } = await this.supabase.from("transient_intent").insert({
        session_id: record.sessionId,
        relationship_id: record.relationshipId ?? null,
        content: record.content,
        expires_at: record.expiresAt,
      });
      if (error) throw error;
    };

    return extractTransientIntent({
      utterance: input.userTurn,
      sessionId: input.sessionId,
      relationshipId: input.relationshipId,
      expiresInMs: this.intentExpiresInMs,
      now: new Date(),
      write,
      detect: this.intentDetector,
    });
  }

  async executeAction(input: ExecuteInput): Promise<EffectResult> {
    return this.executor.execute(input);
  }
}
