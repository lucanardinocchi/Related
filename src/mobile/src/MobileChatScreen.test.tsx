import type { ReactElement } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type {
  ChatMessage,
  ChatRespondEvent,
  ChatSummary,
  ChatsClient,
  ExtractionResult,
  STTAdapter,
} from "@related/shared";
import type { AudioCaptureHandle } from "./voice/ExpoAudioRecorder";
import { MobileChatScreen } from "./MobileChatScreen";

type ChatsClientLike = Pick<
  ChatsClient,
  | "listChats"
  | "listMessages"
  | "createChat"
  | "appendMessage"
  | "respondStream"
  | "closeChat"
  | "extract"
  | "renameChat"
>;

function makeChatsMock(): {
  [K in keyof ChatsClientLike]: jest.Mock;
} {
  return {
    listChats: jest.fn(),
    listMessages: jest.fn(),
    createChat: jest.fn(),
    appendMessage: jest.fn(),
    respondStream: jest.fn(),
    closeChat: jest.fn(),
    extract: jest.fn(),
    renameChat: jest.fn(),
  };
}

function chat(over: Partial<ChatSummary> = {}): ChatSummary {
  return {
    id: "c-1",
    title: null,
    createdAt: "2026-05-21T10:00:00Z",
    closedAt: null,
    extractedAt: null,
    lastMessagePreview: null,
    lastMessageAt: null,
    messageCount: 0,
    ...over,
  };
}

function userMessage(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m-user",
    chatId: "c-1",
    role: "user",
    content: "what's up with Sam?",
    toolCalls: null,
    toolCallId: null,
    createdAt: "2026-05-21T10:01:00Z",
    ...over,
  };
}

async function* streamOf(events: ChatRespondEvent[]) {
  for (const e of events) yield e;
}

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderChat(ui: ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>{ui}</SafeAreaProvider>,
  );
}

describe("<MobileChatScreen />", () => {
  it("sends a user turn and renders the streamed assistant reply", async () => {
    const chats = makeChatsMock();
    chats.listChats.mockResolvedValue([chat()]);
    chats.listMessages.mockResolvedValue([]);
    chats.appendMessage.mockResolvedValue(userMessage());
    chats.renameChat.mockResolvedValue(undefined);
    chats.respondStream.mockReturnValue(
      streamOf([
        { type: "text_delta", delta: "Sam " },
        { type: "text_delta", delta: "is fine." },
        {
          type: "done",
          message: {
            id: "m-asst",
            chatId: "c-1",
            role: "assistant",
            content: "Sam is fine.",
            toolCalls: null,
            toolCallId: null,
            createdAt: "2026-05-21T10:01:30Z",
          },
        },
      ]),
    );

    renderChat(
      <MobileChatScreen
        chatsClient={chats as unknown as ChatsClient}
      />,
    );

    // Wait for the screen to load chats and select the open one.
    await waitFor(() => {
      expect(chats.listMessages).toHaveBeenCalledWith("c-1");
    });

    const input = await screen.findByPlaceholderText(/Tap mic|Message/i);
    fireEvent.changeText(input, "what's up with Sam?");
    fireEvent.press(screen.getByLabelText(/Send/i));

    await waitFor(() => {
      expect(chats.appendMessage).toHaveBeenCalledWith({
        chatId: "c-1",
        role: "user",
        content: "what's up with Sam?",
      });
    });

    await waitFor(() => {
      expect(chats.respondStream).toHaveBeenCalledWith("c-1");
    });

    // The streamed assistant turn should land in the transcript.
    expect(await screen.findByText("Sam is fine.")).toBeTruthy();
  });

  it("auto-plays assistant turns through the TTS playback handle", async () => {
    const chats = makeChatsMock();
    chats.listChats.mockResolvedValue([chat()]);
    chats.listMessages.mockResolvedValue([]);
    chats.appendMessage.mockResolvedValue(userMessage());
    chats.respondStream.mockReturnValue(
      streamOf([
        {
          type: "done",
          message: {
            id: "m-asst",
            chatId: "c-1",
            role: "assistant",
            content: "All good.",
            toolCalls: null,
            toolCallId: null,
            createdAt: "t",
          },
        },
      ]),
    );

    const ttsPlayback = {
      play: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
    };

    renderChat(
      <MobileChatScreen
        chatsClient={chats as unknown as ChatsClient}
        ttsPlayback={ttsPlayback}
      />,
    );

    await waitFor(() => expect(chats.listMessages).toHaveBeenCalled());

    const input = await screen.findByPlaceholderText(/Tap mic|Message/i);
    fireEvent.changeText(input, "hi");
    fireEvent.press(screen.getByLabelText(/Send/i));

    await waitFor(() => {
      expect(ttsPlayback.play).toHaveBeenCalledWith("All good.");
    });
  });

  it("uses the mic adapter to capture audio and transcribe it into the draft", async () => {
    const chats = makeChatsMock();
    chats.listChats.mockResolvedValue([chat()]);
    chats.listMessages.mockResolvedValue([]);

    let stopCallback: (() => void) | null = null;
    const captureHandle: AudioCaptureHandle = {
      audio: (async function* () {
        await new Promise<void>((resolve) => {
          stopCallback = resolve;
        });
        yield new Uint8Array([0x01]);
      })(),
      stop: () => stopCallback?.(),
    };
    const startMicCapture = jest.fn().mockResolvedValue(captureHandle);

    const sttAdapter: Pick<STTAdapter, "transcribeStream"> = {
      transcribeStream: async function* () {
        yield {
          type: "final",
          text: "captured by voice",
          isFinal: true,
        } as never;
      },
    };

    renderChat(
      <MobileChatScreen
        chatsClient={chats as unknown as ChatsClient}
        startMicCapture={startMicCapture}
        sttAdapter={sttAdapter as STTAdapter}
      />,
    );

    await waitFor(() => expect(chats.listMessages).toHaveBeenCalled());

    const micButton = screen.getByLabelText(/Start recording/i);
    await act(async () => {
      fireEvent.press(micButton);
    });
    expect(startMicCapture).toHaveBeenCalled();

    const stopButton = await screen.findByLabelText(/Stop recording/i);
    await act(async () => {
      fireEvent.press(stopButton);
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("captured by voice")).toBeTruthy();
    });
  });
});

// Suppress unused-import warnings for types kept to make jest.fn() typed.
void ((): ExtractionResult | null => null);
