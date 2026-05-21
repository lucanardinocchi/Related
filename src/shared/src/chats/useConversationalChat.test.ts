import type { ChatMessage, ChatRespondEvent } from "./ChatsClient";
import {
  applyRespondEventUpdater,
  consumeRespondStream,
  createStreamingPlaceholder,
  reduceMessagesForRespondEvent,
} from "./conversationalChatState";

async function* streamOf(events: ChatRespondEvent[]) {
  for (const e of events) yield e;
}

function baseMessages(placeholder: ChatMessage): ChatMessage[] {
  return [
    {
      id: "m-user",
      chatId: "c-1",
      role: "user",
      content: "hi",
      toolCalls: null,
      toolCallId: null,
      createdAt: "t0",
    },
    placeholder,
  ];
}

describe("conversationalChatState", () => {
  it("createStreamingPlaceholder returns an empty assistant bubble", () => {
    const { placeholderId, partial } = createStreamingPlaceholder("c-1");
    expect(placeholderId).toMatch(/^streaming-/);
    expect(partial).toMatchObject({
      id: placeholderId,
      chatId: "c-1",
      role: "assistant",
      content: "",
      toolCalls: [],
    });
  });

  it("reduceMessagesForRespondEvent accumulates text_delta", () => {
    const { partial, placeholderId } = createStreamingPlaceholder("c-1");
    const msgs = baseMessages(partial);
    const after = reduceMessagesForRespondEvent(msgs, placeholderId, {
      type: "text_delta",
      delta: "Hello ",
    }).messages;
    expect(after.find((m) => m.id === placeholderId)?.content).toBe("Hello ");
  });

  it("reduceMessagesForRespondEvent tracks tool_use and tool_result", () => {
    const { partial, placeholderId } = createStreamingPlaceholder("c-1");
    let msgs = baseMessages(partial);
    msgs = reduceMessagesForRespondEvent(msgs, placeholderId, {
      type: "tool_use",
      id: "t1",
      name: "list_relationships",
      input: { limit: 5 },
    }).messages;
    msgs = reduceMessagesForRespondEvent(msgs, placeholderId, {
      type: "tool_result",
      id: "t1",
      preview: "3 rows",
    }).messages;
    const toolCalls = msgs.find((m) => m.id === placeholderId)?.toolCalls as Array<{
      name: string;
      result_preview: string;
    }>;
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({
      name: "list_relationships",
      result_preview: "3 rows",
    });
  });

  it("reduceMessagesForRespondEvent swaps placeholder on done", () => {
    const { partial, placeholderId } = createStreamingPlaceholder("c-1");
    const doneMsg: ChatMessage = {
      id: "m-asst",
      chatId: "c-1",
      role: "assistant",
      content: "Done.",
      toolCalls: null,
      toolCallId: null,
      createdAt: "t1",
    };
    const { messages, doneMessage } = reduceMessagesForRespondEvent(
      baseMessages(partial),
      placeholderId,
      { type: "done", message: doneMsg },
    );
    expect(doneMessage).toEqual(doneMsg);
    expect(messages.map((m) => m.id)).toEqual(["m-user", "m-asst"]);
  });

  it("reduceMessagesForRespondEvent removes placeholder on error", () => {
    const { partial, placeholderId } = createStreamingPlaceholder("c-1");
    const { messages } = reduceMessagesForRespondEvent(
      baseMessages(partial),
      placeholderId,
      { type: "error", message: "boom" },
    );
    expect(messages.map((m) => m.id)).toEqual(["m-user"]);
  });

  it("applyRespondEventUpdater matches reduce for text_delta", () => {
    const { partial, placeholderId } = createStreamingPlaceholder("c-1");
    const msgs = baseMessages(partial);
    const updated = applyRespondEventUpdater(placeholderId, {
      type: "text_delta",
      delta: "x",
    })(msgs);
    expect(updated.find((m) => m.id === placeholderId)?.content).toBe("x");
  });
});

describe("consumeRespondStream", () => {
  it("updates messages through the stream and calls onStreamDone", async () => {
    const { partial, placeholderId } = createStreamingPlaceholder("c-1");
    let messages = baseMessages(partial);
    const setMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      messages = updater(messages);
    };
    const doneMsg: ChatMessage = {
      id: "m-asst",
      chatId: "c-1",
      role: "assistant",
      content: "All good.",
      toolCalls: null,
      toolCallId: null,
      createdAt: "t1",
    };
    const onStreamDone = jest.fn();

    await consumeRespondStream(
      streamOf([
        { type: "text_delta", delta: "All " },
        { type: "text_delta", delta: "good." },
        { type: "done", message: doneMsg },
      ]),
      { placeholderId, setMessages, onStreamDone },
    );

    expect(messages.find((m) => m.id === "m-asst")?.content).toBe("All good.");
    expect(onStreamDone).toHaveBeenCalledWith(doneMsg);
  });

  it("surfaces stream errors and drops the placeholder", async () => {
    const { partial, placeholderId } = createStreamingPlaceholder("c-1");
    let messages = baseMessages(partial);
    const setMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      messages = updater(messages);
    };
    const onStreamError = jest.fn();

    await consumeRespondStream(
      streamOf([{ type: "error", message: "rate limited" }]),
      {
        placeholderId,
        setMessages,
        onStreamError,
        formatStreamError: (m) => `Agent: ${m}`,
      },
    );

    expect(messages.map((m) => m.id)).toEqual(["m-user"]);
    expect(onStreamError).toHaveBeenCalledWith("Agent: rate limited");
  });

  it("handles thrown errors from the iterable", async () => {
    const { partial, placeholderId } = createStreamingPlaceholder("c-1");
    let messages = baseMessages(partial);
    const setMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      messages = updater(messages);
    };
    const onStreamError = jest.fn();

    async function* failing() {
      yield { type: "text_delta", delta: "x" } satisfies ChatRespondEvent;
      throw new Error("network down");
    }

    await consumeRespondStream(failing(), {
      placeholderId,
      setMessages,
      onStreamError,
    });

    expect(messages.map((m) => m.id)).toEqual(["m-user"]);
    expect(onStreamError).toHaveBeenCalledWith("network down");
  });
});
