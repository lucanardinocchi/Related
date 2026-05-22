import Anthropic from "@anthropic-ai/sdk";

import {
  CONVERSATIONAL_MODEL,
  renderContextBlock,
  runConversationalToolLoop,
  SYSTEM_PROMPT_BASE,
} from "@related/shared/conversational";
import type { AnthropicStreamingClient } from "@related/shared/conversational";
import { dispatchFixtureTool } from "./tools";
import type {
  AgentTrace,
  ConversationContextSnapshot,
  FixtureToolData,
  ToolCallSummary,
} from "./types";

export { CONVERSATIONAL_MODEL as DEFAULT_MODEL };

export interface RunConversationalAgentTurnOptions {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  snapshot: ConversationContextSnapshot;
  fixture: FixtureToolData;
  model?: string;
}

export interface RunConversationalAgentTurnResult {
  text: string;
  toolCalls: ToolCallSummary[];
  trace: AgentTrace;
}

function requireApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is required. Set it in the environment before running evals.",
    );
  }
  return key;
}

/**
 * Run one Conversational Intelligence turn against fixture data.
 * Uses the shared tool loop; collects a full trace instead of SSE.
 */
export async function runConversationalAgentTurn(
  options: RunConversationalAgentTurnOptions,
): Promise<RunConversationalAgentTurnResult> {
  const model = options.model ?? CONVERSATIONAL_MODEL;
  const startedAt = new Date();
  const contextBlock = renderContextBlock(options.snapshot);
  const anthropic = new Anthropic({ apiKey: requireApiKey() });

  const trace: AgentTrace = {
    systemPromptBase: SYSTEM_PROMPT_BASE,
    contextBlock,
    model,
    startedAt: startedAt.toISOString(),
    finishedAt: "",
    latencyMs: 0,
    rounds: [],
    output: { text: "", toolCalls: [] },
  };

  const { text, toolCalls } = await runConversationalToolLoop({
    client: anthropic as unknown as AnthropicStreamingClient,
    model,
    history: options.history,
    contextBlock,
    dispatchTool: (name, input) =>
      dispatchFixtureTool(name, input, options.fixture),
    callbacks: {
      onRoundComplete: (round) => {
        trace.rounds.push(round);
      },
    },
  });

  const finishedAt = new Date();
  trace.finishedAt = finishedAt.toISOString();
  trace.latencyMs = finishedAt.getTime() - startedAt.getTime();
  trace.output = { text, toolCalls };

  return { text, toolCalls, trace };
}
