import type { ChatMessage, ChatRespondEvent } from "./ChatsClient";

/** Tool-call chip shape rendered inline on assistant turns (ADR-0009). */
export interface ToolCallSummary {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result_preview: string;
  error?: string;
}

export function createStreamingPlaceholder(chatId: string): {
  placeholderId: string;
  partial: ChatMessage;
} {
  const placeholderId = `streaming-${Date.now()}`;
  return {
    placeholderId,
    partial: {
      id: placeholderId,
      chatId,
      role: "assistant",
      content: "",
      toolCalls: [],
      toolCallId: null,
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Pure reducer for one chat-respond SSE event against the local transcript.
 */
export function reduceMessagesForRespondEvent(
  messages: ChatMessage[],
  placeholderId: string,
  event: ChatRespondEvent,
): { messages: ChatMessage[]; doneMessage?: ChatMessage } {
  switch (event.type) {
    case "text_delta":
      return {
        messages: messages.map((m) =>
          m.id === placeholderId
            ? { ...m, content: m.content + event.delta }
            : m,
        ),
      };
    case "tool_use":
      return {
        messages: messages.map((m) =>
          m.id === placeholderId
            ? {
                ...m,
                toolCalls: [
                  ...((m.toolCalls ?? []) as ToolCallSummary[]),
                  {
                    id: event.id,
                    name: event.name,
                    input: event.input,
                    result_preview: "",
                  },
                ],
              }
            : m,
        ),
      };
    case "tool_result":
      return {
        messages: messages.map((m) =>
          m.id === placeholderId
            ? {
                ...m,
                toolCalls: ((m.toolCalls ?? []) as ToolCallSummary[]).map(
                  (tc) =>
                    tc.id === event.id
                      ? {
                          ...tc,
                          result_preview: event.preview,
                          error: event.error,
                        }
                      : tc,
                ),
              }
            : m,
        ),
      };
    case "done":
      return {
        messages: messages.map((m) =>
          m.id === placeholderId ? event.message : m,
        ),
        doneMessage: event.message,
      };
    case "error":
      return {
        messages: messages.filter((m) => m.id !== placeholderId),
      };
  }
}

/** React setState-style updater for one respond-stream event. */
export function applyRespondEventUpdater(
  placeholderId: string,
  event: ChatRespondEvent,
): (prev: ChatMessage[]) => ChatMessage[] {
  return (prev) => reduceMessagesForRespondEvent(prev, placeholderId, event).messages;
}

export type SetMessagesFn = (
  updater: (prev: ChatMessage[]) => ChatMessage[],
) => void;

export interface ConsumeRespondStreamParams {
  placeholderId: string;
  setMessages: SetMessagesFn;
  onStreamError?: (message: string) => void;
  onStreamDone?: (message: ChatMessage) => void;
  formatStreamError?: (message: string) => string;
}

/**
 * Consume chat-respond SSE events into local message state.
 * Caller must append `createStreamingPlaceholder(...).partial` before invoking.
 */
export async function consumeRespondStream(
  events: AsyncIterable<ChatRespondEvent>,
  params: ConsumeRespondStreamParams,
): Promise<void> {
  const {
    placeholderId,
    setMessages,
    onStreamError,
    onStreamDone,
    formatStreamError = (m) => m,
  } = params;

  try {
    for await (const event of events) {
      if (event.type === "error") {
        setMessages((prev) => prev.filter((m) => m.id !== placeholderId));
        onStreamError?.(formatStreamError(event.message));
        return;
      }
      setMessages(applyRespondEventUpdater(placeholderId, event));
      if (event.type === "done") {
        onStreamDone?.(event.message);
      }
    }
  } catch (err) {
    setMessages((prev) => prev.filter((m) => m.id !== placeholderId));
    const raw = err instanceof Error ? err.message : String(err);
    onStreamError?.(formatStreamError(raw));
  }
}
