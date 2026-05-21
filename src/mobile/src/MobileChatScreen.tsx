import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type {
  ChatMessage,
  ChatSummary,
  ChatsClient,
  ExtractionResult,
  STTAdapter,
  ToolCallSummary,
  TTSPlayback,
} from "@related/shared";
import { useConversationalChat } from "@related/shared/chats/useConversationalChat";
import type { AudioCaptureHandle } from "./voice/ExpoAudioRecorder";
import { colors, fonts, fontSizes, lineHeights, radii } from "./ui/tokens";

export interface MobileChatScreenProps {
  chatsClient: ChatsClient;
  initialChatId?: string;
  startMicCapture?: () => Promise<AudioCaptureHandle>;
  sttAdapter?: STTAdapter;
  ttsPlayback?: TTSPlayback;
}

type ToastMsg = {
  kind: "info" | "success" | "error";
  text: string;
};

type VoiceState = "idle" | "recording" | "transcribing";

const STARTER_PROMPTS = [
  "What's on my calendar this week?",
  "Who haven't I caught up with lately?",
  "Help me think through a relationship",
] as const;

const DRAWER_WIDTH = 300;

export function MobileChatScreen({
  chatsClient,
  initialChatId,
  startMicCapture,
  sttAdapter,
  ttsPlayback,
}: MobileChatScreenProps) {
  const insets = useSafeAreaInsets();
  const [chatList, setChatList] = useState<ChatSummary[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(
    initialChatId ?? null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [working, setWorking] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ttsMuted, setTtsMuted] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");

  const captureRef = useRef<AudioCaptureHandle | null>(null);
  const transcriptRef = useRef<FlatList<ChatMessage>>(null);

  const micEnabled = !!(startMicCapture && sttAdapter);
  const hasDraft = draft.trim().length > 0;

  const selectedChat = useMemo(
    () => chatList.find((c) => c.id === selectedChatId) ?? null,
    [chatList, selectedChatId],
  );

  const { responding, runAgentRespondStream, closeChatAndExtract } =
    useConversationalChat({
      chatsClient,
      streamErrorPrefix: "Agent didn't respond: ",
      onStreamError: (text) => setToast({ kind: "error", text }),
      onStreamDone: (message) => {
        if (ttsPlayback && !ttsMuted && message.content) {
          void ttsPlayback.play(message.content).catch(() => {});
        }
      },
    });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const refreshChats = useCallback(async () => {
    const list = await chatsClient.listChats();
    setChatList(list);
  }, [chatsClient]);

  const handleMic = useCallback(async () => {
    if (!micEnabled) return;
    if (responding || voiceState === "transcribing" || selectedChat?.closedAt) {
      return;
    }

    if (voiceState === "idle") {
      try {
        const handle = await startMicCapture!();
        captureRef.current = handle;
        setVoiceState("recording");
      } catch (err) {
        setToast({
          kind: "error",
          text: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    const handle = captureRef.current;
    if (!handle) return;
    handle.stop();
    captureRef.current = null;
    setVoiceState("transcribing");
    try {
      let transcript = "";
      for await (const ev of sttAdapter!.transcribeStream({
        audio: handle.audio,
      })) {
        const text = (ev as { text?: string; final?: string }).text;
        const final = (ev as { final?: string }).final;
        if (final) transcript = final;
        else if (text) transcript += text;
      }
      if (transcript) {
        setDraft((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    } catch (err) {
      setToast({
        kind: "error",
        text:
          "Voice transcription failed: " +
          (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      setVoiceState("idle");
    }
  }, [
    micEnabled,
    responding,
    selectedChat?.closedAt,
    sttAdapter,
    startMicCapture,
    voiceState,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await chatsClient.listChats();
        if (cancelled) return;
        setChatList(list);

        const preferredId =
          initialChatId ?? list.find((c) => !c.closedAt)?.id ?? null;

        if (preferredId) {
          setSelectedChatId(preferredId);
          return;
        }

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
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatsClient, initialChatId]);

  useEffect(() => {
    if (!selectedChatId) return;
    let cancelled = false;
    setLoadingMessages(true);
    chatsClient
      .listMessages(selectedChatId)
      .then((rows) => {
        if (!cancelled) setMessages(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setToast({
            kind: "error",
            text: err instanceof Error ? err.message : String(err),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chatsClient, selectedChatId]);

  const handleNewChat = async () => {
    setWorking(true);
    setDrawerOpen(false);
    try {
      const chat = await chatsClient.createChat();
      setSelectedChatId(chat.id);
      setMessages([]);
      setDraft("");
      await refreshChats();
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setWorking(false);
    }
  };

  const handleClose = async () => {
    if (!selectedChat || selectedChat.closedAt) return;
    setWorking(true);
    try {
      await closeChatAndExtract(selectedChat.id, {
        onClosed: refreshChats,
        onExtracting: () =>
          setToast({ kind: "info", text: "Chat closed. Extracting context…" }),
        onExtractResult: (result) => {
          setToast({
            kind: "success",
            text: extractionToast(result),
          });
        },
        onExtractError: (err) =>
          setToast({
            kind: "error",
            text:
              "Chat closed, but extraction failed: " +
              (err instanceof Error ? err.message : String(err)),
          }),
      });
      await refreshChats();
      setDrawerOpen(false);
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedChat) return;
    setWorking(true);
    try {
      await chatsClient.deleteChat(selectedChat.id);
      const remaining = chatList.filter((c) => c.id !== selectedChat.id);
      setChatList(remaining);
      setSelectedChatId(remaining[0]?.id ?? null);
      setMessages([]);
      setDrawerOpen(false);
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setWorking(false);
    }
  };

  const sendTurn = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || !selectedChatId || responding || selectedChat?.closedAt) {
      return;
    }
    setDraft("");
    setError(null);
    setWorking(true);

    let userMsg: ChatMessage;
    try {
      userMsg = await chatsClient.appendMessage({
        chatId: selectedChatId,
        role: "user",
        content: trimmed,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setWorking(false);
      return;
    }
    setMessages((prev) => [...prev, userMsg]);

    if (!selectedChat?.title && messages.length === 0) {
      try {
        await chatsClient.renameChat(selectedChatId, trimmed.slice(0, 60));
        await refreshChats();
      } catch {
        /* non-fatal */
      }
    }

    await runAgentRespondStream(selectedChatId, setMessages);
    await refreshChats();
    setWorking(false);
  }, [
    chatsClient,
    draft,
    messages.length,
    refreshChats,
    responding,
    runAgentRespondStream,
    selectedChat?.closedAt,
    selectedChat?.title,
    selectedChatId,
  ]);

  const headerTitle = selectedChat?.title ?? "Related";
  const isClosed = !!selectedChat?.closedAt;
  const composerDisabled = working || responding || isClosed;
  const showEmptyState = !loadingMessages && messages.length === 0;

  const composerPlaceholder =
    voiceState === "recording"
      ? "Recording… tap square to stop."
      : voiceState === "transcribing"
        ? "Transcribing…"
        : micEnabled
          ? "Message the agent…"
          : "Message";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Minimal Claude-style top bar */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open chat list"
          onPress={() => setDrawerOpen(true)}
          style={styles.headerIconBtn}
          hitSlop={8}
        >
          <Text style={styles.headerIcon}>☰</Text>
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {headerTitle}
          </Text>
          {selectedChat?.closedAt ? (
            <Text style={styles.headerSubtitle}>
              {selectedChat.extractedAt ? "Extracted" : "Closed"}
            </Text>
          ) : null}
        </View>

        <View style={styles.headerRight}>
          {ttsPlayback ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ttsMuted ? "Unmute TTS" : "Mute TTS"}
              onPress={() => setTtsMuted((v) => !v)}
              style={styles.headerIconBtn}
              hitSlop={8}
            >
              <Text style={styles.headerIcon}>{ttsMuted ? "🔇" : "🔊"}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New chat"
            onPress={handleNewChat}
            disabled={working}
            style={styles.headerIconBtn}
            hitSlop={8}
          >
            <Text style={styles.headerIcon}>✎</Text>
          </Pressable>
        </View>
      </View>

      {toast ? (
        <View
          style={[
            styles.toast,
            toast.kind === "error" && styles.toastError,
            toast.kind === "success" && styles.toastSuccess,
            toast.kind === "info" && styles.toastInfo,
          ]}
        >
          <Text
            style={[
              styles.toastText,
              toast.kind === "error" && styles.toastTextError,
              toast.kind === "success" && styles.toastTextSuccess,
              toast.kind === "info" && styles.toastTextInfo,
            ]}
          >
            {toast.text}
          </Text>
        </View>
      ) : null}

      {/* Transcript — message-first, full bleed */}
      <View style={styles.transcriptWrap}>
        {loadingMessages ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.fgSubtle} />
          </View>
        ) : (
          <FlatList
            ref={transcriptRef}
            style={styles.transcript}
            contentContainerStyle={[
              styles.transcriptContent,
              showEmptyState && styles.transcriptContentEmpty,
            ]}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <MessageBubble message={item} />}
            ItemSeparatorComponent={() => <View style={styles.messageGap} />}
            ListEmptyComponent={
              showEmptyState ? (
                <EmptyState
                  onSelectPrompt={setDraft}
                  micEnabled={micEnabled}
                />
              ) : null
            }
            ListFooterComponent={
              responding ? (
                <View style={styles.thinkingRow}>
                  <ActivityIndicator size="small" color={colors.fgSubtle} />
                  <Text style={styles.thinkingText}>
                    Agent is reading your data…
                  </Text>
                </View>
              ) : null
            }
            onContentSizeChange={() =>
              transcriptRef.current?.scrollToEnd({ animated: true })
            }
          />
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Floating composer — Claude-style pill at bottom */}
      {isClosed ? (
        <View
          style={[
            styles.closedBanner,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <Text style={styles.closedBannerText}>
            This chat is closed. Start a new chat to keep talking.
          </Text>
        </View>
      ) : (
        <View
          style={[
            styles.composerDock,
            { paddingBottom: Math.max(insets.bottom, 10) },
          ]}
        >
          <View style={styles.composerPill}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder={composerPlaceholder}
              placeholderTextColor={colors.fgSubtle}
              multiline
              editable={!composerDisabled && voiceState === "idle"}
            />

            {micEnabled && !hasDraft && voiceState !== "transcribing" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  voiceState === "recording"
                    ? "Stop recording"
                    : "Start recording"
                }
                style={[
                  styles.composerAction,
                  voiceState === "recording" && styles.composerActionRecording,
                ]}
                onPress={handleMic}
                disabled={composerDisabled}
              >
                <Text
                  style={[
                    styles.composerActionIcon,
                    voiceState === "recording" && styles.composerActionIconActive,
                  ]}
                >
                  {voiceState === "recording" ? "■" : "●"}
                </Text>
              </Pressable>
            ) : voiceState === "transcribing" ? (
              <View style={styles.composerAction}>
                <ActivityIndicator size="small" color={colors.fgSubtle} />
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send"
                style={[
                  styles.composerAction,
                  styles.composerActionSend,
                  (!hasDraft || composerDisabled) && styles.composerActionDisabled,
                ]}
                onPress={sendTurn}
                disabled={!hasDraft || composerDisabled}
              >
                {responding ? (
                  <ActivityIndicator size="small" color={colors.fgOnAccent} />
                ) : (
                  <Text style={styles.composerSendIcon}>↑</Text>
                )}
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Left history drawer — Claude-style slide-in */}
      <Modal
        visible={drawerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setDrawerOpen(false)}
      >
        <View style={styles.drawerOverlay}>
          <Pressable
            style={styles.drawerBackdrop}
            accessibilityRole="button"
            accessibilityLabel="Close chat list"
            onPress={() => setDrawerOpen(false)}
          />
          <View
            style={[
              styles.drawerPanel,
              { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 },
            ]}
          >
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>Chats</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="New chat"
                onPress={handleNewChat}
                disabled={working}
                style={styles.drawerNewBtn}
              >
                <Text style={styles.drawerNewBtnLabel}>+ New</Text>
              </Pressable>
            </View>

            <FlatList
              data={chatList}
              keyExtractor={(c) => c.id}
              style={styles.drawerList}
              contentContainerStyle={styles.drawerListContent}
              ListEmptyComponent={
                <Text style={styles.drawerEmpty}>No chats yet.</Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setSelectedChatId(item.id);
                    setDrawerOpen(false);
                  }}
                  style={[
                    styles.drawerRow,
                    item.id === selectedChatId && styles.drawerRowActive,
                  ]}
                >
                  <Text style={styles.drawerRowTitle} numberOfLines={1}>
                    {item.title ?? "Untitled chat"}
                  </Text>
                  {item.lastMessagePreview ? (
                    <Text style={styles.drawerRowPreview} numberOfLines={2}>
                      {item.lastMessagePreview}
                    </Text>
                  ) : null}
                  {item.closedAt ? (
                    <Text style={styles.drawerRowMeta}>
                      {item.extractedAt ? "Extracted" : "Closed"}
                    </Text>
                  ) : null}
                </Pressable>
              )}
            />

            {selectedChat ? (
              <View style={styles.drawerFooter}>
                {!isClosed ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleClose}
                    disabled={working}
                    style={styles.drawerFooterBtn}
                  >
                    <Text style={styles.drawerFooterBtnLabel}>Close chat</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={handleDelete}
                  disabled={working}
                  style={styles.drawerFooterBtnDanger}
                >
                  <Text style={styles.drawerFooterBtnDangerLabel}>
                    Delete chat
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function EmptyState({
  onSelectPrompt,
  micEnabled,
}: {
  onSelectPrompt: (text: string) => void;
  micEnabled: boolean;
}) {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyGreeting}>What's on your mind?</Text>
      <Text style={styles.emptyHint}>
        {micEnabled
          ? "Tap the mic or pick a prompt to start."
          : "Pick a prompt or type a message below."}
      </Text>
      <View style={styles.promptList}>
        {STARTER_PROMPTS.map((prompt) => (
          <Pressable
            key={prompt}
            accessibilityRole="button"
            onPress={() => onSelectPrompt(prompt)}
            style={styles.promptChip}
          >
            <Text style={styles.promptChipText}>{prompt}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function extractionToast(result: ExtractionResult): string {
  if ("skipped" in result && result.skipped) {
    return `Extraction skipped: ${result.reason}.`;
  }
  if (!("ok" in result)) return "Extraction complete.";
  const bits: string[] = [];
  if (result.situationalStateUpdated) bits.push("Situational State updated");
  if (result.intentsCaptured > 0) {
    bits.push(
      `${result.intentsCaptured} intent${result.intentsCaptured === 1 ? "" : "s"} captured`,
    );
  }
  const head = bits.length ? bits.join(", ") : "no User Context updates";
  const tail = result.toolErrors.length
    ? ` (with ${result.toolErrors.length} tool error${result.toolErrors.length === 1 ? "" : "s"})`
    : "";
  return `Extraction complete: ${head}${tail}.`;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const toolCalls = (message.toolCalls ?? []) as ToolCallSummary[];

  if (isUser) {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userBubbleText}>{message.content}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.assistantRow}>
      {toolCalls.length > 0 ? (
        <View style={styles.toolStrip}>
          {toolCalls.map((tc) => (
            <View key={tc.id} style={styles.toolChip}>
              <Text style={styles.toolChipText}>{tc.name}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={styles.assistantText}>
        {message.content || "…"}
      </Text>
    </View>
  );
}

const shadowSm = {
  shadowColor: "#37352f",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 3,
} as const;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
  },
  headerIcon: {
    fontSize: 18,
    color: colors.fgMuted,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontFamily: fonts.sansMedium,
    color: colors.fg,
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: fontSizes.micro,
    lineHeight: lineHeights.micro,
    fontFamily: fonts.sans,
    color: colors.fgSubtle,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  toast: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  toastError: { backgroundColor: colors.dangerSubtle },
  toastSuccess: { backgroundColor: colors.successSubtle },
  toastInfo: { backgroundColor: colors.infoSubtle },
  toastText: {
    fontSize: fontSizes.small,
    fontFamily: fonts.sans,
    textAlign: "center",
  },
  toastTextError: { color: colors.danger },
  toastTextSuccess: { color: colors.success },
  toastTextInfo: { color: colors.accent },
  transcriptWrap: {
    flex: 1,
  },
  transcript: {
    flex: 1,
  },
  transcriptContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    flexGrow: 1,
  },
  transcriptContentEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },
  messageGap: {
    height: 20,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWrap: {
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 32,
  },
  emptyGreeting: {
    fontSize: fontSizes.h1,
    lineHeight: lineHeights.h1,
    fontFamily: fonts.sansBold,
    color: colors.fg,
    textAlign: "center",
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: fontSizes.small,
    lineHeight: lineHeights.small,
    fontFamily: fonts.sans,
    color: colors.fgMuted,
    textAlign: "center",
    marginBottom: 24,
    maxWidth: 280,
  },
  promptList: {
    width: "100%",
    gap: 10,
  },
  promptChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  promptChipText: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontFamily: fonts.sans,
    color: colors.fg,
  },
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 16,
    paddingBottom: 8,
  },
  thinkingText: {
    color: colors.fgSubtle,
    fontSize: fontSizes.small,
    fontFamily: fonts.sans,
  },
  assistantRow: {
    width: "100%",
  },
  assistantText: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontFamily: fonts.sans,
    color: colors.fg,
  },
  userRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  userBubble: {
    maxWidth: "85%",
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubbleText: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontFamily: fonts.sans,
    color: colors.fgOnAccent,
  },
  toolStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  toolChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toolChipText: {
    fontSize: fontSizes.micro,
    color: colors.accent,
    fontFamily: fonts.sansMedium,
  },
  composerDock: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: colors.bg,
  },
  composerPill: {
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 24,
    backgroundColor: colors.surface,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    ...shadowSm,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    color: colors.fg,
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    paddingVertical: 6,
    paddingRight: 8,
  },
  composerAction: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  composerActionRecording: {
    backgroundColor: colors.danger,
  },
  composerActionSend: {
    backgroundColor: colors.accent,
  },
  composerActionDisabled: {
    opacity: 0.35,
  },
  composerActionIcon: {
    fontSize: fontSizes.body,
    color: colors.fgMuted,
    fontFamily: fonts.sansBold,
  },
  composerActionIconActive: {
    color: colors.fgOnAccent,
  },
  composerSendIcon: {
    fontSize: fontSizes.h3,
    color: colors.fgOnAccent,
    fontFamily: fonts.sansBold,
  },
  error: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    color: colors.danger,
    fontFamily: fonts.sans,
    fontSize: fontSizes.small,
  },
  closedBanner: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  closedBannerText: {
    textAlign: "center",
    color: colors.fgSubtle,
    fontSize: fontSizes.small,
    fontFamily: fonts.sans,
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: "row",
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(55, 53, 47, 0.25)",
  },
  drawerPanel: {
    width: DRAWER_WIDTH,
    backgroundColor: colors.surface,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  drawerTitle: {
    fontSize: fontSizes.h2,
    fontFamily: fonts.sansBold,
    color: colors.fg,
  },
  drawerNewBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  drawerNewBtnLabel: {
    fontSize: fontSizes.small,
    fontFamily: fonts.sansMedium,
    color: colors.fg,
  },
  drawerList: {
    flex: 1,
  },
  drawerListContent: {
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  drawerEmpty: {
    padding: 16,
    color: colors.fgSubtle,
    fontFamily: fonts.sans,
    fontSize: fontSizes.small,
  },
  drawerRow: {
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 2,
  },
  drawerRowActive: {
    backgroundColor: colors.active,
  },
  drawerRowTitle: {
    fontSize: fontSizes.body,
    fontFamily: fonts.sansMedium,
    color: colors.fg,
    marginBottom: 2,
  },
  drawerRowPreview: {
    fontSize: fontSizes.small,
    fontFamily: fonts.sans,
    color: colors.fgMuted,
    lineHeight: lineHeights.small,
  },
  drawerRowMeta: {
    marginTop: 4,
    fontSize: fontSizes.micro,
    fontFamily: fonts.sansMedium,
    color: colors.fgSubtle,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  drawerFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 4,
  },
  drawerFooterBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  drawerFooterBtnLabel: {
    fontSize: fontSizes.body,
    fontFamily: fonts.sansMedium,
    color: colors.fg,
  },
  drawerFooterBtnDanger: {
    paddingVertical: 12,
    alignItems: "center",
  },
  drawerFooterBtnDangerLabel: {
    fontSize: fontSizes.body,
    fontFamily: fonts.sansMedium,
    color: colors.danger,
  },
});
