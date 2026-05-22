/**
 * @jest-environment jsdom
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import type {
  Chat,
  ChatMessage,
  ChatRespondEvent,
  ChatSummary,
  ChatsClient,
  ExtractionResult,
} from "./ChatsClient";
import { useChatLifecycle } from "./useChatLifecycle";

async function* streamOf(events: ChatRespondEvent[]) {
  for (const e of events) yield e;
}

function summary(over: Partial<ChatSummary> = {}): ChatSummary {
  return {
    id: "c-1",
    title: null,
    source: "conversational",
    createdAt: "2026-05-21T10:00:00Z",
    closedAt: null,
    extractedAt: null,
    lastMessagePreview: null,
    lastMessageAt: null,
    messageCount: 0,
    ...over,
  };
}

type ChatsClientLike = Pick<
  ChatsClient,
  | "listAgentChats"
  | "listMessages"
  | "createChat"
  | "appendMessage"
  | "respondStream"
  | "closeChat"
  | "extract"
  | "renameChat"
  | "deleteChat"
>;

function makeFakeChatsClient(seed: ChatSummary[] = [summary()]): {
  client: ChatsClient;
  mocks: { [K in keyof ChatsClientLike]: jest.Mock };
} {
  const mocks = {
    listAgentChats: jest.fn(async () => seed),
    listMessages: jest.fn(async () => [] as ChatMessage[]),
    createChat: jest.fn(
      async (): Promise<Chat> => ({
        id: "c-new",
        title: null,
        source: "conversational",
        createdAt: "2026-05-21T11:00:00Z",
        closedAt: null,
        extractedAt: null,
      }),
    ),
    appendMessage: jest.fn(
      async (input): Promise<ChatMessage> => ({
        id: "m-new",
        chatId: input.chatId,
        role: input.role,
        content: input.content,
        toolCalls: null,
        toolCallId: null,
        createdAt: "2026-05-21T10:01:00Z",
      }),
    ),
    respondStream: jest.fn(() =>
      streamOf([
        {
          type: "done",
          message: {
            id: "m-asst",
            chatId: "c-1",
            role: "assistant",
            content: "Reply.",
            toolCalls: null,
            toolCallId: null,
            createdAt: "2026-05-21T10:01:30Z",
          },
        },
      ]),
    ),
    closeChat: jest.fn(
      async (id): Promise<Chat> => ({
        id,
        title: "Titled",
        source: "conversational",
        createdAt: "2026-05-21T10:00:00Z",
        closedAt: "2026-05-21T12:00:00Z",
        extractedAt: null,
      }),
    ),
    extract: jest.fn(
      async (): Promise<ExtractionResult> => ({
        ok: true,
        extracted_at: "2026-05-21T12:00:01Z",
        notesLogged: 1,
        interactionsLogged: 0,
        commsLogged: 0,
        commitmentsOpened: 0,
        toolErrors: [],
      }),
    ),
    renameChat: jest.fn(async (id, title) => ({
      id,
      title,
      source: "conversational" as const,
      createdAt: "2026-05-21T10:00:00Z",
      closedAt: null,
      extractedAt: null,
    })),
    deleteChat: jest.fn(async () => undefined),
  };

  return { client: mocks as unknown as ChatsClient, mocks };
}

describe("useChatLifecycle", () => {
  it("selectChat loads messages for the chosen chat", async () => {
    const existing: ChatMessage[] = [
      {
        id: "m-1",
        chatId: "c-2",
        role: "user",
        content: "Earlier thread",
        toolCalls: null,
        toolCallId: null,
        createdAt: "t",
      },
    ];
    const { client, mocks } = makeFakeChatsClient([
      summary({ id: "c-1" }),
      summary({ id: "c-2", title: "Other" }),
    ]);
    mocks.listMessages.mockImplementation(async (chatId: string) =>
      chatId === "c-2" ? existing : [],
    );

    const { result } = renderHook(() =>
      useChatLifecycle({
        chatsClient: client,
        initialChats: [
          summary({ id: "c-1" }),
          summary({ id: "c-2", title: "Other" }),
        ],
      }),
    );

    await waitFor(() => {
      expect(mocks.listMessages).toHaveBeenCalledWith("c-1");
    });

    await act(async () => {
      result.current.selectChat("c-2");
    });

    await waitFor(() => {
      expect(mocks.listMessages).toHaveBeenCalledWith("c-2");
      expect(result.current.messages).toEqual(existing);
    });
  });

  it("sendMessage appends, auto-titles, streams, and refreshes the chat list", async () => {
    const { client, mocks } = makeFakeChatsClient([summary()]);
    const onStreamDone = jest.fn();

    const { result } = renderHook(() =>
      useChatLifecycle({
        chatsClient: client,
        initialChats: [summary()],
        onStreamDone,
      }),
    );

    await waitFor(() => expect(mocks.listMessages).toHaveBeenCalled());

    await act(async () => {
      const sendResult = await result.current.sendMessage("Hello from the user");
      expect(sendResult).toEqual({ ok: true });
    });

    expect(mocks.appendMessage).toHaveBeenCalledWith({
      chatId: "c-1",
      role: "user",
      content: "Hello from the user",
    });
    expect(mocks.renameChat).toHaveBeenCalledWith("c-1", "Hello from the user");
    expect(mocks.respondStream).toHaveBeenCalledWith("c-1");
    expect(mocks.listAgentChats).toHaveBeenCalled();
    expect(onStreamDone).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Reply." }),
    );
    expect(result.current.messages.some((m) => m.content === "Reply.")).toBe(
      true,
    );
  });

  it("closeSelectedChat closes the chat and runs extraction once", async () => {
    const { client, mocks } = makeFakeChatsClient([summary()]);
    const onExtracting = jest.fn();
    const onExtractResult = jest.fn();

    const { result } = renderHook(() =>
      useChatLifecycle({
        chatsClient: client,
        initialChats: [summary()],
      }),
    );

    await waitFor(() => expect(mocks.listMessages).toHaveBeenCalled());

    await act(async () => {
      await result.current.closeSelectedChat({
        onExtracting,
        onExtractResult,
      });
    });

    expect(mocks.closeChat).toHaveBeenCalledWith("c-1");
    expect(onExtracting).toHaveBeenCalled();
    expect(mocks.extract).toHaveBeenCalledWith("c-1");
    expect(onExtractResult).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true }),
    );
    expect(mocks.listAgentChats).toHaveBeenCalled();
  });

  it("auto-creates a chat when the inbox is empty on mobile mount", async () => {
    const { client, mocks } = makeFakeChatsClient([]);

    const { result } = renderHook(() =>
      useChatLifecycle({
        chatsClient: client,
        autoCreateWhenEmpty: true,
      }),
    );

    await waitFor(() => {
      expect(mocks.createChat).toHaveBeenCalled();
      expect(result.current.selectedChatId).toBe("c-new");
    });
  });
});
