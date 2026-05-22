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

export interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface AnthropicMessageStream {
  on(event: "text", handler: (delta: string) => void): void;
  finalMessage(): Promise<{
    content?: AnthropicContentBlock[];
    usage?: AnthropicUsage;
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

export interface AnthropicCreateClient {
  messages: {
    create(req: {
      model: string;
      max_tokens: number;
      system: unknown;
      tools: unknown;
      messages: unknown;
    }): Promise<{
      content?: AnthropicContentBlock[];
      usage?: AnthropicUsage;
    }>;
  };
}

export interface AgentToolLoopCallbacks {
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

/** @deprecated Use AgentToolLoopCallbacks */
export type ConversationalToolLoopCallbacks = AgentToolLoopCallbacks;

export type CallModelFn = (params: {
  model: string;
  max_tokens: number;
  system: unknown;
  tools: unknown;
  messages: unknown;
  onTextDelta?: (delta: string) => void;
}) => Promise<{
  content: AnthropicContentBlock[];
  usage?: AnthropicUsage;
}>;

export interface RunAgentToolLoopOptions {
  callModel: CallModelFn;
  system: unknown;
  tools: unknown;
  messages: Array<{ role: "user" | "assistant"; content: string | unknown[] }>;
  dispatchTool: (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<unknown> | unknown;
  model: string;
  maxTokens: number;
  maxToolRounds: number;
  roundLimitMessage?: string | null;
  callbacks?: AgentToolLoopCallbacks;
}

export interface RunAgentToolLoopResult {
  text: string;
  toolCalls: ToolCallSummary[];
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
  callbacks?: AgentToolLoopCallbacks;
}

export type RunConversationalToolLoopResult = RunAgentToolLoopResult;

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

export function streamingCallModel(
  client: AnthropicStreamingClient,
): CallModelFn {
  return async (params) => {
    const stream = client.messages.stream({
      model: params.model,
      max_tokens: params.max_tokens,
      system: params.system,
      tools: params.tools,
      messages: params.messages,
    });

    stream.on("text", (delta: string) => {
      if (!delta) return;
      params.onTextDelta?.(delta);
    });

    const finalMessage = await stream.finalMessage();
    return {
      content: finalMessage.content ?? [],
      usage: finalMessage.usage,
    };
  };
}

export function createCallModel(client: AnthropicCreateClient): CallModelFn {
  return async (params) => {
    const resp = await client.messages.create({
      model: params.model,
      max_tokens: params.max_tokens,
      system: params.system,
      tools: params.tools,
      messages: params.messages,
    });

    for (const block of resp.content ?? []) {
      if (block.type === "text" && block.text) {
        params.onTextDelta?.(block.text);
      }
    }

    return {
      content: resp.content ?? [],
      usage: resp.usage,
    };
  };
}

export async function runAgentToolLoop(
  options: RunAgentToolLoopOptions,
): Promise<RunAgentToolLoopResult> {
  const toolCalls: ToolCallSummary[] = [];
  const working = options.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let finalText = "";

  for (let round = 0; round < options.maxToolRounds; round++) {
    const roundStarted = Date.now();
    const textParts: string[] = [];

    const { content: blocks, usage } = await options.callModel({
      model: options.model,
      max_tokens: options.maxTokens,
      system: options.system,
      tools: options.tools,
      messages: working,
      onTextDelta: (delta) => {
        textParts.push(delta);
        options.callbacks?.onTextDelta?.(delta);
      },
    });

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
      usage: usage
        ? {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cache_creation_input_tokens:
              usage.cache_creation_input_tokens ?? undefined,
            cache_read_input_tokens: usage.cache_read_input_tokens ?? undefined,
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

    if (round === options.maxToolRounds - 1) {
      finalText = options.roundLimitMessage ?? "";
    }
  }

  return { text: finalText, toolCalls };
}

export async function runConversationalToolLoop(
  options: RunConversationalToolLoopOptions,
): Promise<RunConversationalToolLoopResult> {
  return runAgentToolLoop({
    callModel: streamingCallModel(options.client),
    system: buildConversationalSystemBlocks(options.contextBlock),
    tools: CONVERSATIONAL_TOOLS,
    messages: options.history.map((m) => ({ role: m.role, content: m.content })),
    dispatchTool: options.dispatchTool,
    model: options.model ?? CONVERSATIONAL_MODEL,
    maxTokens: options.maxTokens ?? CONVERSATIONAL_MAX_TOKENS,
    maxToolRounds: options.maxToolRounds ?? CONVERSATIONAL_MAX_TOOL_ROUNDS,
    roundLimitMessage: TOOL_ROUND_LIMIT_MESSAGE,
    callbacks: options.callbacks,
  });
}

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
