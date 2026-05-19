import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentCaller, AgentPrompt, CandidateActionInput } from "./PassEngine";

export interface EdgeFunctionAgentCallerOptions {
  supabase: SupabaseClient;
  /** Defaults to 'engaged-pass'. Override for staging variants. */
  functionName?: string;
}

/**
 * Client-side AgentCaller that delegates the actual Sonnet 4.6 call to a
 * Supabase Edge Function (`engaged-pass`). The API key never leaves the
 * server. The client sends the prompt; the function returns the parsed
 * Candidate Action list.
 */
export class EdgeFunctionAgentCaller implements AgentCaller {
  private readonly supabase: SupabaseClient;
  private readonly functionName: string;

  constructor(opts: EdgeFunctionAgentCallerOptions) {
    this.supabase = opts.supabase;
    this.functionName = opts.functionName ?? "engaged-pass";
  }

  async propose(prompt: AgentPrompt): Promise<CandidateActionInput[]> {
    const { data, error } = await this.supabase.functions.invoke(
      this.functionName,
      { body: { prompt } },
    );
    if (error) {
      throw new Error(
        (error as { message?: string }).message ??
          `engaged-pass function call failed`,
      );
    }
    const actions = (data as { actions?: unknown })?.actions;
    if (!Array.isArray(actions)) {
      throw new Error(
        "engaged-pass response missing `actions` array",
      );
    }
    return actions as CandidateActionInput[];
  }
}
