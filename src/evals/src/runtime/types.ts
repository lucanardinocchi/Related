// Eval-specific types. Snapshot shapes live in @related/shared/conversational.

import type {
  AgentRoundTrace,
  AgentTrace,
  ConversationContextSnapshot,
  GroupSummary,
  InteractionSummary,
  OpenThreadSummary,
  RelationshipSummary,
  ToolCallSummary,
  ToolResultBlock,
  ToolUseBlock,
  TransientIntentSummary,
} from "@related/shared/conversational/types";

export type {
  AgentRoundTrace,
  AgentTrace,
  ConversationContextSnapshot,
  GroupSummary,
  InteractionSummary,
  OpenThreadSummary,
  RelationshipSummary,
  ToolCallSummary,
  ToolResultBlock,
  ToolUseBlock,
  TransientIntentSummary,
};

/** Full tool-resolution data for a fixture world. */
export interface FixtureToolData {
  relationships: Record<string, unknown>[];
  contacts: Record<string, unknown>[];
  groups: Record<string, unknown>[];
  openThreads: Record<string, unknown>[];
  interactions: Record<string, unknown>[];
  events: Record<string, unknown>[];
  userContext: {
    goalsAndValues: Record<string, unknown>[];
    situationalState: Record<string, unknown> | null;
    transientIntent: Record<string, unknown>[];
    inferredSignals: unknown | null;
  };
}

export interface WorldFixture {
  id: string;
  snapshot: ConversationContextSnapshot;
  toolData: FixtureToolData;
}

export interface EvalCase {
  id: string;
  description: string;
  tags: string[];
  world: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  notes?: string;
}

export interface RunManifestCase {
  id: string;
  description: string;
  tags: string[];
  traceFile: string;
  latencyMs: number;
  review: null;
}

export interface RunManifest {
  runId: string;
  startedAt: string;
  finishedAt: string;
  gitSha: string;
  model: string;
  cases: RunManifestCase[];
}

/** Trace file shape written for the local viewer. */
export interface EvalTrace {
  caseId: string;
  description?: string;
  tags?: string[];
  notes?: string;
  runId: string;
  model: string;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  input: {
    worldFixtureId: string;
    history: Array<{ role: string; content: string }>;
    systemPromptBase: string;
    contextBlock: string;
  };
  rounds: Array<{
    round: number;
    latencyMs?: number;
    usage?: AgentRoundTrace["usage"];
    toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>;
    toolResults: Array<{
      id: string;
      result: unknown;
      error?: string;
      latencyMs?: number;
    }>;
    text: string;
  }>;
  output: {
    text: string;
    toolCalls: ToolCallSummary[];
  };
}

export interface RunIndexEntry {
  runId: string;
  path: string;
  startedAt: string;
  caseCount: number;
}
