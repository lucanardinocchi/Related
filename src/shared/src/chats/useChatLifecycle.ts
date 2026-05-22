"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Chat,
  ChatMessage,
  ChatSummary,
  ChatsClient,
  ExtractionResult,
} from "./ChatsClient";
import {
  consumeRespondStream,
  createStreamingPlaceholder,
} from "./conversationalChatState";
import type { SetMessagesFn } from "./conversationalChatState";

export interface UseChatLifecycleOptions {
  chatsClient: ChatsClient;
  initialChats?: ChatSummary[];
  initialChatId?: string | null;
  autoCreateWhenEmpty?: boolean;
  streamErrorPrefix?: string;
  onStreamError?: (message: string) => void;
  onStreamDone?: (message: ChatMessage) => void;
  onListLoadError?: (message: string) => void;
  onMessageLoadError?: (message: string) => void;
}

export interface CloseChatExtractCallbacks {
  onClosed?: () => void | Promise<void>;
  onExtracting?: () => void;
  onExtractResult?: (result: ExtractionResult) => void;
  onExtractError?: (err: unknown) => void;
}

export type SendMessageResult =
  | { ok: true }
  | { ok: false; error: string; phase: "append" | "other" };

function chatToSummary(chat: Chat): ChatSummary {
  return {
    id: chat.id,
    title: chat.title,
    source: chat.source,
    createdAt: chat.createdAt,
    closedAt: chat.closedAt,
    extractedAt: chat.extractedAt,
    lastMessagePreview: null,
    lastMessageAt: null,
    messageCount: 0,
  };
}

function defaultSelectedId(
  chats: ChatSummary[],
  initialChatId?: string | null,
): string | null {
  return (
    initialChatId ??
    chats.find((c) => !c.closedAt)?.id ??
    chats[0]?.id ??
    null
  );
}

/** Full Conversational Chat lifecycle — list, select, send, close. */
export function useChatLifecycle({
  chatsClient,
  initialChats,
  initialChatId,
  autoCreateWhenEmpty = false,
  streamErrorPrefix = "",
  onStreamError,
  onStreamDone,
  onListLoadError,
  onMessageLoadError,
}: UseChatLifecycleOptions) {
  const [chats, setChats] = useState<ChatSummary[]>(initialChats ?? []);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(() =>
    initialChats ? defaultSelectedId(initialChats, initialChatId) : null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [responding, setResponding] = useState(false);
  const [working, setWorking] = useState(false);

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  const formatStreamError = useCallback(
    (message: string) => `${streamErrorPrefix}${message}`,
    [streamErrorPrefix],
  );

  const refreshChats = useCallback(async () => {
    const list = await chatsClient.listAgentChats();
    setChats(list);
  }, [chatsClient]);

  const runAgentRespondStream = useCallback(
    async (chatId: string, setMsgs: SetMessagesFn) => {
      const { placeholderId, partial } = createStreamingPlaceholder(chatId);
      setMsgs((prev) => [...prev, partial]);
      setResponding(true);
      try {
        await consumeRespondStream(chatsClient.respondStream(chatId), {
          placeholderId,
          setMessages: setMsgs,
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

  useEffect(() => {
    if (initialChats !== undefined) return;

    let cancelled = false;
    (async () => {
      try {
        const list = await chatsClient.listAgentChats();
        if (cancelled) return;
        setChats(list);

        const preferredId = defaultSelectedId(list, initialChatId);
        if (preferredId) {
          setSelectedChatId(preferredId);
          return;
        }

        if (autoCreateWhenEmpty) {
          const created = await chatsClient.createChat();
          if (cancelled) return;
          setChats((prev) => [chatToSummary(created), ...prev]);
          setSelectedChatId(created.id);
        }
      } catch (err) {
        if (!cancelled) {
          onListLoadError?.(
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    chatsClient,
    initialChats,
    initialChatId,
    autoCreateWhenEmpty,
    onListLoadError,
  ]);

  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    setLoadingMessages(true);
    chatsClient
      .listMessages(selectedChatId)
      .then((rows) => {
        if (!cancelled) setMessages(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          onMessageLoadError?.(
            err instanceof Error ? err.message : String(err),
          );
          setMessages([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedChatId, chatsClient, onMessageLoadError]);

  const selectChat = useCallback((id: string | null) => {
    setSelectedChatId(id);
  }, []);

  const createChat = useCallback(async () => {
    setWorking(true);
    try {
      const chat = await chatsClient.createChat();
      setSelectedChatId(chat.id);
      setMessages([]);
      await refreshChats();
      return chat.id;
    } finally {
      setWorking(false);
    }
  }, [chatsClient, refreshChats]);

  const deleteSelectedChat = useCallback(async () => {
    if (!selectedChat) return;
    setWorking(true);
    try {
      await chatsClient.deleteChat(selectedChat.id);
      const remaining = chats.filter((c) => c.id !== selectedChat.id);
      setChats(remaining);
      setSelectedChatId(remaining[0]?.id ?? null);
      setMessages([]);
    } finally {
      setWorking(false);
    }
  }, [chatsClient, chats, selectedChat]);

  const sendMessage = useCallback(
    async (text: string): Promise<SendMessageResult> => {
      const trimmed = text.trim();
      if (!trimmed || !selectedChatId || responding) {
        return { ok: false, error: "invalid", phase: "other" };
      }
      if (!selectedChat || selectedChat.closedAt) {
        return { ok: false, error: "closed", phase: "other" };
      }

      setWorking(true);
      const messageCountBefore = messages.length;

      let userMsg: ChatMessage;
      try {
        userMsg = await chatsClient.appendMessage({
          chatId: selectedChatId,
          role: "user",
          content: trimmed,
        });
      } catch (err) {
        setWorking(false);
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          phase: "append",
        };
      }

      setMessages((prev) => [...prev, userMsg]);

      if (!selectedChat.title && messageCountBefore === 0) {
        try {
          await chatsClient.renameChat(selectedChatId, trimmed.slice(0, 60));
        } catch {
          // non-fatal
        }
      }

      await runAgentRespondStream(selectedChatId, setMessages);

      try {
        await refreshChats();
      } catch (err) {
        setWorking(false);
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          phase: "other",
        };
      }

      setWorking(false);
      return { ok: true };
    },
    [
      chatsClient,
      messages.length,
      refreshChats,
      responding,
      runAgentRespondStream,
      selectedChat,
      selectedChatId,
    ],
  );

  const closeSelectedChat = useCallback(
    async (callbacks: CloseChatExtractCallbacks = {}) => {
      if (!selectedChat || selectedChat.closedAt) return;
      setWorking(true);
      try {
        await closeChatAndExtract(selectedChat.id, callbacks);
        await refreshChats();
      } finally {
        setWorking(false);
      }
    },
    [closeChatAndExtract, refreshChats, selectedChat],
  );

  return {
    chats,
    setChats,
    selectedChatId,
    selectedChat,
    selectChat,
    messages,
    loadingMessages,
    responding,
    working,
    refreshChats,
    createChat,
    deleteSelectedChat,
    sendMessage,
    closeSelectedChat,
    runAgentRespondStream,
    closeChatAndExtract,
  };
}
