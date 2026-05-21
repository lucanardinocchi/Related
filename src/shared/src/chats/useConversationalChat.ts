"use client";

import { useCallback, useState } from "react";
import type { ChatMessage, ChatsClient, ExtractionResult } from "./ChatsClient";
import {
  consumeRespondStream,
  createStreamingPlaceholder,
} from "./conversationalChatState";
import type { SetMessagesFn } from "./conversationalChatState";

export interface UseConversationalChatOptions {
  chatsClient: ChatsClient;
  /** Prefix prepended to stream errors (e.g. web: "Agent didn't respond: "). */
  streamErrorPrefix?: string;
  onStreamError?: (message: string) => void;
  onStreamDone?: (message: ChatMessage) => void;
}

export interface CloseChatExtractCallbacks {
  onClosed?: () => void | Promise<void>;
  onExtracting?: () => void;
  onExtractResult?: (result: ExtractionResult) => void;
  onExtractError?: (err: unknown) => void;
}

/**
 * Headless Conversational Intelligence turn orchestration shared by web
 * and mobile. Owns the respond-stream placeholder lifecycle and optional
 * close → extract pass.
 */
export function useConversationalChat({
  chatsClient,
  streamErrorPrefix = "",
  onStreamError,
  onStreamDone,
}: UseConversationalChatOptions) {
  const [responding, setResponding] = useState(false);

  const formatStreamError = useCallback(
    (message: string) => `${streamErrorPrefix}${message}`,
    [streamErrorPrefix],
  );

  const runAgentRespondStream = useCallback(
    async (chatId: string, setMessages: SetMessagesFn) => {
      const { placeholderId, partial } = createStreamingPlaceholder(chatId);
      setMessages((prev) => [...prev, partial]);
      setResponding(true);
      try {
        await consumeRespondStream(chatsClient.respondStream(chatId), {
          placeholderId,
          setMessages,
          onStreamError,
          onStreamDone,
          formatStreamError,
        });
      } finally {
        setResponding(false);
      }
    },
    [chatsClient, formatStreamError, onStreamError, onStreamDone],
  );

  const closeChatAndExtract = useCallback(
    async (chatId: string, callbacks: CloseChatExtractCallbacks = {}) => {
      const closed = await chatsClient.closeChat(chatId);
      await callbacks.onClosed?.();
      callbacks.onExtracting?.();
      try {
        const result = await chatsClient.extract(closed.id);
        callbacks.onExtractResult?.(result);
      } catch (err) {
        callbacks.onExtractError?.(err);
      }
      return closed;
    },
    [chatsClient],
  );

  return { responding, runAgentRespondStream, closeChatAndExtract };
}
