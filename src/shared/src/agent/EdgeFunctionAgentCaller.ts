import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentCaller, AgentPrompt, CandidateActionInput } from "./agentPassRun";

export interface EdgeFunctionAgentCallerOptions {
  supabase: SupabaseClient;
  functionName?: string;
}

export class EdgeFunctionAgentCaller implements AgentCaller {
  private readonly supabase: SupabaseClient;
  private readonly functionName: string;

  constructor(opts: EdgeFunctionAgentCallerOptions) {
    this.supabase = opts.supabase;
    this.functionName = opts.functionName ?? "ambient-pass";
  }

  async propose(prompt: AgentPrompt): Promise<CandidateActionInput[]> {
    const { data, error } = await this.supabase.functions.invoke(this.functionName, { body: { prompt } });
    if (error) {
      const ctx = error as { context?: Response; message?: string };
      const detail = ctx.context
        ? ((await ctx.context.json().catch(() => null)) as { error?: string } | null)
        : null;
      throw new Error(detail?.error ?? ctx.message ?? `${this.functionName} function call failed`);
    }
    const json = (data ?? {}) as { actions?: unknown; error?: string };
    if (json.error) throw new Error(json.error);
    if (!Array.isArray(json.actions)) {
      throw new Error(`${this.functionName} response missing \`actions\` array`);
    }
    return json.actions as CandidateActionInput[];
  }
}
