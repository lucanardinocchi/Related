/** Snapshot and agent-loop types shared by chat-respond and eval harness. */

export interface ToolCallSummary {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result_preview: string;
  error?: string;
}

export interface RelationshipSummary {
  id: string;
  target_type: "contact" | "group";
  role: string | null;
  cadence: string | null;
  name: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  member_count: number;
}

export interface OpenThreadSummary {
  id: string;
  description: string;
  direction: "me_owes_them" | "they_owe_me";
  days_outstanding: number;
  relationship_ids: string[];
}

export interface InteractionSummary {
  id: string;
  time: string;
  kind: string | null;
  status: string | null;
  contact_ids: string[];
}

export interface TransientIntentSummary {
  content: string;
  captured_at: string;
  relationship_id: string | null;
}

export interface ConversationContextSnapshot {
  /** ISO timestamp at which the snapshot was assembled. */
  asOf: string;
  relationships: RelationshipSummary[];
  relationshipsTotal: number;
  groups: GroupSummary[];
  userContext: {
    goalsAndValues: string[];
    situationalState: string | null;
    recentTransientIntent: TransientIntentSummary[];
  };
  openThreads: OpenThreadSummary[];
  openThreadsTotal: number;
  recentInteractions: InteractionSummary[];
  recentInteractionsTotal: number;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
  result: unknown;
}

export interface AgentRoundTrace {
  round: number;
  toolUses: ToolUseBlock[];
  toolResults: ToolResultBlock[];
  /** Assistant text emitted during this round (streamed deltas concatenated). */
  text: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  latencyMs: number;
}

export interface AgentTrace {
  systemPromptBase: string;
  contextBlock: string;
  model: string;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  rounds: AgentRoundTrace[];
  output: {
    text: string;
    toolCalls: ToolCallSummary[];
  };
}
