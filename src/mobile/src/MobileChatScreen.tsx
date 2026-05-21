import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  ChatMessage,
  ChatSummary,
  ChatsClient,
  STTAdapter,
  ToolCallSummary,
  TTSPlayback,
} from "@related/shared";
import { useConversationalChat } from "@related/shared/chats/useConversationalChat";
import type { AudioCaptureHandle } from "./voice/ExpoAudioRecorder";
import { colors, fonts, fontSizes, lineHeights, radii } from "./ui/tokens";

export interface MobileChatScreenProps {
  chatsClient: ChatsClient;
  /**
   * Optional initial chat to open. Defaults to the most recent open
   * chat in the User's list, or a freshly-created one if none exists.
   */
  initialChatId?: string;
  /**
   * Voice-input dependencies. Both must be supplied together for the
   * mic button to render. Tests inject fakes; production wires
   * `startExpoAudioCapture(...)` + `WisprFlowSTTAdapter`.
   */
  startMicCapture?: () => Promise<AudioCaptureHandle>;
  sttAdapter?: STTAdapter;
  /**
   * Auto-plays assistant turns through ElevenLabs by default — the
   * primary mobile UX is voice-out (per ADR-0009 mobile amendment).
   * Tests inject a stub; the User can mute via the header toggle.
   */
  ttsPlayback?: TTSPlayback;
}

/**
 * Conversational Intelligence on mobile (per ADR-0009 mobile
 * amendment). Voice-primary in production; the test surface here is
 * deliberately mic-agnostic so behavior is exercisable without native
 * audio capture (#51 wires that in).
 *
 * The screen is a list of the User's chats with a transcript pane
 * underneath. Sending a turn appends the user message, then consumes
 * the SSE stream from `chat-respond`, rendering text deltas and
 * tool-call chips as they arrive.
 */
export function MobileChatScreen({
  chatsClient,
  initialChatId,
  startMicCapture,
  sttAdapter,
  ttsPlayback,
}: MobileChatScreenProps) {
  const [chatList, setChatList] = useState<ChatSummary[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(
    initialChatId ?? null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Mic state. `recording` means the User has started capture but not
  // yet stopped; `transcribing` means the audio handle has been closed
  // and we're awaiting the STT adapter.
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const captureRef = useRef<AudioCaptureHandle | null>(null);
  const transcriptRef = useRef<FlatList<ChatMessage>>(null);

  const micEnabled = !!(startMicCapture && sttAdapter);

  const { responding, runAgentRespondStream } = useConversationalChat({
    chatsClient,
    onStreamError: setError,
    onStreamDone: (message) => {
      if (ttsPlayback && message.content) {
        void ttsPlayback.play(message.content).catch(() => {});
      }
    },
  });

  const handleMic = useCallback(async () => {
    if (!micEnabled) return;
    if (responding || transcribing) return;
    if (!recording) {
      try {
        const handle = await startMicCapture!();
        captureRef.current = handle;
        setRecording(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
      return;
    }
    // Stop + transcribe.
    const handle = captureRef.current;
    if (!handle) return;
    handle.stop();
    setRecording(false);
    setTranscribing(true);
    try {
      let transcript = "";
      for await (const ev of sttAdapter!.transcribeStream({
        audio: handle.audio,
      })) {
        const text = (ev as { text?: string }).text;
        if (text) transcript += text;
      }
      setDraft((prev) => (prev ? `${prev} ${transcript}` : transcript));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      captureRef.current = null;
      setTranscribing(false);
    }
  }, [
    micEnabled,
    recording,
    responding,
    sttAdapter,
    startMicCapture,
    transcribing,
  ]);

  // Load chat list on mount; auto-select most recent open chat (or
  // create one if none exists). Multi-tenant safe via RLS — the User
  // only sees their own.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await chatsClient.listChats();
        if (cancelled) return;
        setChatList(list);
        if (!selectedChatId) {
          const openChat = list.find((c) => !c.closedAt);
          if (openChat) {
            setSelectedChatId(openChat.id);
          } else {
            const created = await chatsClient.createChat();
            if (cancelled) return;
            setChatList((prev) => [
              {
                id: created.id,
                title: created.title,
                createdAt: created.createdAt,
                closedAt: created.closedAt,
                extractedAt: created.extractedAt,
                lastMessagePreview: null,
                lastMessageAt: null,
                messageCount: 0,
              },
              ...prev,
            ]);
            setSelectedChatId(created.id);
          }
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatsClient]);

  // Load transcript whenever the selected chat changes.
  useEffect(() => {
    if (!selectedChatId) return;
    let cancelled = false;
    chatsClient
      .listMessages(selectedChatId)
      .then((rows) => {
        if (!cancelled) setMessages(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chatsClient, selectedChatId]);

  const sendTurn = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || !selectedChatId || responding) return;
    setDraft("");
    setError(null);

    let userMsg: ChatMessage;
    try {
      userMsg = await chatsClient.appendMessage({
        chatId: selectedChatId,
        role: "user",
        content: trimmed,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    setMessages((prev) => [...prev, userMsg]);
    await runAgentRespondStream(selectedChatId, setMessages);
  }, [chatsClient, draft, responding, runAgentRespondStream, selectedChatId]);

  const headerTitle = useMemo(() => {
    const c = chatList.find((c) => c.id === selectedChatId);
    return c?.title || "New chat";
  }, [chatList, selectedChatId]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <Text style={styles.headerSubtitle}>Conversational</Text>
      </View>

      <FlatList
        ref={transcriptRef}
        style={styles.transcript}
        contentContainerStyle={styles.transcriptContent}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Tap the mic and tell me what's on your mind.
          </Text>
        }
        onContentSizeChange={() =>
          transcriptRef.current?.scrollToEnd({ animated: true })
        }
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.composer}>
        {micEnabled ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              recording ? "Stop recording" : "Start recording"
            }
            style={[
              styles.micButton,
              recording && styles.micButtonRecording,
              transcribing && styles.micButtonDisabled,
            ]}
            onPress={handleMic}
            disabled={transcribing || responding}
          >
            {transcribing ? (
              <ActivityIndicator size="small" color={colors.fgOnAccent} />
            ) : (
              <Text style={styles.micLabel}>{recording ? "■" : "●"}</Text>
            )}
          </Pressable>
        ) : null}
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={
            micEnabled ? "Tap mic or type a message" : "Message"
          }
          placeholderTextColor={colors.fgSubtle}
          multiline
          editable={!responding}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          style={[
            styles.sendButton,
            (!draft.trim() || responding) && styles.sendButtonDisabled,
          ]}
          onPress={sendTurn}
          disabled={!draft.trim() || responding}
        >
          {responding ? (
            <ActivityIndicator size="small" color={colors.fgOnAccent} />
          ) : (
            <Text style={styles.sendLabel}>Send</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <View
      style={[
        styles.bubbleRow,
        isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ]}
      >
        {(message.toolCalls ?? []).length > 0 ? (
          <View style={styles.toolStrip}>
            {(message.toolCalls as ToolCallSummary[]).map((tc) => (
              <View key={tc.id} style={styles.toolChip}>
                <Text style={styles.toolChipText}>{tc.name}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text
          style={[
            styles.bubbleText,
            isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant,
          ]}
        >
          {message.content || (isUser ? "" : "…")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerTitle: {
    fontSize: fontSizes.h2,
    lineHeight: lineHeights.h2,
    color: colors.fg,
    fontFamily: fonts.sansBold,
  },
  headerSubtitle: {
    fontSize: fontSizes.micro,
    lineHeight: lineHeights.micro,
    color: colors.fgSubtle,
    fontFamily: fonts.sans,
    marginTop: 2,
  },
  transcript: {
    flex: 1,
  },
  transcriptContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  empty: {
    textAlign: "center",
    color: colors.fgSubtle,
    fontFamily: fonts.sans,
    marginTop: 64,
    paddingHorizontal: 24,
  },
  bubbleRow: {
    flexDirection: "row",
  },
  bubbleRowUser: {
    justifyContent: "flex-end",
  },
  bubbleRowAssistant: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "85%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.lg,
  },
  bubbleUser: {
    backgroundColor: colors.fg,
  },
  bubbleAssistant: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontFamily: fonts.sans,
  },
  bubbleTextUser: {
    color: colors.fgOnAccent,
  },
  bubbleTextAssistant: {
    color: colors.fg,
  },
  toolStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  toolChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSubtle,
  },
  toolChipText: {
    fontSize: fontSizes.micro,
    color: colors.accent,
    fontFamily: fonts.sansMedium,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    color: colors.fg,
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
  },
  sendButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.fg,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  micButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  micButtonRecording: {
    backgroundColor: colors.danger,
  },
  micButtonDisabled: {
    opacity: 0.5,
  },
  micLabel: {
    color: colors.fgOnAccent,
    fontSize: fontSizes.body,
    fontFamily: fonts.sansBold,
  },
  sendLabel: {
    color: colors.fgOnAccent,
    fontSize: fontSizes.body,
    fontFamily: fonts.sansMedium,
  },
  error: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: colors.danger,
    fontFamily: fonts.sans,
    fontSize: fontSizes.small,
  },
});
