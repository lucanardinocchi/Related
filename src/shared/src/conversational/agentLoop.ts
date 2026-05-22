import { SYSTEM_PROMPT_BASE } from "./prompt.ts";
import { CONVERSATIONAL_TOOLS } from "./tools.ts";
import type {
  AgentRoundTrace,
  ToolCallSummary,
  ToolResultBlock,
  ToolUseBlock,
} from "./types.ts";

export const CONVERSATIONAL_MODEL = "claude-sonnet-4-6";
export const CONVERSATIONAL_MAX_TOKENS = 4096;
export const CONVERSATIONAL_MAX_TOOL_ROUNDS = 8;

export const TOOL_ROUND_LIMIT_MESSAGE =
  "(I tried to gather data but exceeded the tool-use round limit. Could you narrow what you'd like me to look at?)";

export interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface AnthropicMessageStream {
  on(event: "text", handler: (delta: string) => void): void;
  finalMessage(): Promise<{
    content?: AnthropicContentBlock[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number | null;
      cache_read_input_tokens?: number | null;
    };
  }>;
}

export interface AnthropicStreamingClient {
  messages: {
    stream(req: {
      model: string;
      max_tokens: number;
      system: unknown;
      tools: unknown;
      messages: unknown;
    }): AnthropicMessageStream;
  };
}

export interface ConversationalToolLoopCallbacks {
  onTextDelta?: (delta: string) => void;
  onToolUse?: (tool: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  }) => void;
  onToolResult?: (result: {
    id: string;
    preview: string;
    error?: string;
  }) => void;
  onRoundComplete?: (round: AgentRoundTrace) => void;
}

export interface RunConversationalToolLoopOptions {
  client: AnthropicStreamingClient;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  contextBlock: string;
  dispatchTool: (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<unknown> | unknown;
  model?: string;
  maxTokens?: number;
  maxToolRounds?: number;
  callbacks?: ConversationalToolLoopCallbacks;
}

export interface RunConversationalToolLoopResult {
  text: string;
  toolCalls: ToolCallSummary[];
}

export function buildConversationalSystemBlocks(contextBlock: string) {
  return [
    {
      type: "text" as const,
      text: SYSTEM_PROMPT_BASE,
      cache_control: { type: "ephemeral" as const },
    },
    { type: "text" as const, text: contextBlock },
  ];
}

export function previewToolResultJson(result: unknown): string {
  const json = JSON.stringify(result);
  return json.length > 4000 ? json.slice(0, 4000) + "…" : json;
}

/**
 * Multi-round Anthropic tool-use loop shared by chat-respond (SSE) and eval harness (trace).
 */
export async function runConversationalToolLoop(
  options: RunConversationalToolLoopOptions,
): Promise<RunConversationalToolLoopResult> {
  const model = options.model ?? CONVERSATIONAL_MODEL;
  const maxTokens = options.maxTokens ?? CONVERSATIONAL_MAX_TOKENS;
  const maxToolRounds = options.maxToolRounds ?? CONVERSATIONAL_MAX_TOOL_ROUNDS;
  const toolCalls: ToolCallSummary[] = [];
  const systemBlocks = buildConversationalSystemBlocks(options.contextBlock);

  const working: Array<{
    role: "user" | "assistant";
    content: string | unknown[];
  }> = options.history.map((m) => ({ role: m.role, content: m.content }));

  let finalText = "";

  for (let round = 0; round < maxToolRounds; round++) {
    const roundStarted = Date.now();
    const textParts: string[] = [];

    const stream = options.client.messages.stream({
      model,
      max_tokens: maxTokens,
      system: systemBlocks,
      tools: CONVERSATIONAL_TOOLS,
      messages: working,
    });

    stream.on("text", (delta: string) => {
      if (!delta) return;
      textParts.push(delta);
      options.callbacks?.onTextDelta?.(delta);
    });

    const finalMessage = await stream.finalMessage();
    const blocks = finalMessage.content ?? [];

    const toolUses: ToolUseBlock[] = blocks
      .filter((b) => b.type === "tool_use")
      .map((b) => ({
        type: "tool_use" as const,
        id: b.id ?? "",
        name: b.name ?? "",
        input: (b.input ?? {}) as Record<string, unknown>,
      }));

    const roundTrace: AgentRoundTrace = {
      round,
      toolUses,
      toolResults: [],
      text: textParts.join(""),
      usage: finalMessage.usage
        ? {
            input_tokens: finalMessage.usage.input_tokens,
            output_tokens: finalMessage.usage.output_tokens,
            cache_creation_input_tokens:
              finalMessage.usage.cache_creation_input_tokens ?? undefined,
            cache_read_input_tokens:
              finalMessage.usage.cache_read_input_tokens ?? undefined,
          }
        : undefined,
      latencyMs: Date.now() - roundStarted,
    };

    if (toolUses.length === 0) {
      finalText = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n")
        .trim();
      options.callbacks?.onRoundComplete?.(roundTrace);
      return { text: finalText, toolCalls };
    }

    for (const tu of toolUses) {
      options.callbacks?.onToolUse?.({
        id: tu.id,
        name: tu.name,
        input: tu.input,
      });
    }

    working.push({ role: "assistant", content: blocks });

    const results = await Promise.all(
      toolUses.map(async (tu) => {
        try {
          const result = await options.dispatchTool(tu.name, tu.input);
          const json = JSON.stringify(result);
          const preview = previewToolResultJson(result);
          toolCalls.push({
            id: tu.id,
            name: tu.name,
            input: tu.input,
            result_preview: preview,
          });
          options.callbacks?.onToolResult?.({
            id: tu.id,
            preview,
          });
          const block: ToolResultBlock = {
            type: "tool_result",
            tool_use_id: tu.id,
            content: json,
            result,
          };
          roundTrace.toolResults.push(block);
          return {
            type: "tool_result" as const,
            tool_use_id: tu.id,
            content: json,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          toolCalls.push({
            id: tu.id,
            name: tu.name,
            input: tu.input,
            result_preview: "",
            error: message,
          });
          options.callbacks?.onToolResult?.({
            id: tu.id,
            preview: "",
            error: message,
          });
          const block: ToolResultBlock = {
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Error: ${message}`,
            is_error: true,
            result: { error: message },
          };
          roundTrace.toolResults.push(block);
          return {
            type: "tool_result" as const,
            tool_use_id: tu.id,
            content: `Error: ${message}`,
            is_error: true,
          };
        }
      }),
    );

    options.callbacks?.onRoundComplete?.(roundTrace);
    working.push({ role: "user", content: results });

    if (round === maxToolRounds - 1) {
      finalText = TOOL_ROUND_LIMIT_MESSAGE;
    }
  }

  return { text: finalText, toolCalls };
}

/**
 * Build Anthropic message array from stored chat history.
 *
 * Per ADR-0009: stored assistant turns capture the final text plus
 * tool_calls metadata for UI rendering. Intermediate tool_use /
 * tool_result rounds are ephemeral within a single invocation.
 */
export function buildConversationalHistoryMessages(
  rows: Array<{ role: string; content: string }>,
): Array<{ role: "user" | "assistant"; content: string }> {
  return rows
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content,
    }));
}
