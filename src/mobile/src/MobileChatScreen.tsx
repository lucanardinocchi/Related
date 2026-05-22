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
  ChatsClient,
  STTAdapter,
  ToolCallSummary,
  TTSPlayback,
} from "@related/shared";
import { filterChatSummaries, formatExtractionResult } from "@related/shared";
import { useConversationalChat } from "@related/shared/chats/useConversationalChat";
import type { AudioCaptureHandle } from "./voice/ExpoAudioRecorder";
import { colors, fonts, fontSizes, lineHeights, radii } from "./ui/tokens";

export interface MobileChatScreenProps {
  chatsClient: ChatsClient;
  initialChatId?: string;
  /** Pre-fill the composer — e.g. when redirecting from a Relationship. */
  initialDraft?: string;
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
  initialDraft,
  startMicCapture,
  sttAdapter,
  ttsPlayback,
}: MobileChatScreenProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ttsMuted, setTtsMuted] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [chatSearch, setChatSearch] = useState("");
  const [chatListExpanded, setChatListExpanded] = useState(false);
  const [drawerListHeight, setDrawerListHeight] = useState(0);
  const [drawerContentHeight, setDrawerContentHeight] = useState(0);

  const captureRef = useRef<AudioCaptureHandle | null>(null);
  const transcriptRef = useRef<FlatList<ChatMessage>>(null);

  const micEnabled = !!(startMicCapture && sttAdapter);
  const hasDraft = draft.trim().length > 0;

  const showErrorToast = useCallback(
    (text: string) => setToast({ kind: "error", text }),
    [],
  );

  const {
    chats: chatList,
    selectedChatId,
    selectedChat,
    selectChat,
    messages,
    loadingMessages,
    responding,
    working,
    createChat,
    deleteSelectedChat,
    sendMessage,
    closeSelectedChat,
  } = useConversationalChat({
    chatsClient,
    initialChatId,
    autoCreateWhenEmpty: true,
    streamErrorPrefix: "Agent didn't respond: ",
    onStreamError: showErrorToast,
    onMessageLoadError: showErrorToast,
    onListLoadError: (message) => setError(message),
    onStreamDone: (message) => {
      if (ttsPlayback && !ttsMuted && message.content) {
        void ttsPlayback.play(message.content).catch(() => {});
      }
    },
  });

  const filteredChatList = useMemo(
    () => filterChatSummaries(chatList, chatSearch),
    [chatList, chatSearch],
  );

  const chatListScrollable =
    chatListExpanded || chatSearch.trim().length > 0;

  const drawerListOverflows =
    !chatListScrollable &&
    drawerContentHeight > drawerListHeight + 2 &&
    drawerListHeight > 0;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (initialDraft) setDraft(initialDraft);
  }, [initialDraft]);

  useEffect(() => {
    if (!drawerOpen) {
      setChatListExpanded(false);
    }
  }, [drawerOpen]);

  const handleNewChat = async () => {
    setDrawerOpen(false);
    try { await createChat(); setDraft(""); }
    catch (err) { showErrorToast(err instanceof Error ? err.message : String(err)); }
  };
  const handleClose = async () => {
    if (!selectedChat || selectedChat.closedAt) return;
    try {
      await closeSelectedChat({
        onExtracting: () => setToast({ kind: "info", text: "Chat closed. Extracting context…" }),
        onExtractResult: (result) => setToast({ kind: "success", text: formatExtractionResult(result) }),
        onExtractError: (err) => setToast({ kind: "error", text: "Chat closed, but extraction failed: " + (err instanceof Error ? err.message : String(err)) }),
      });
      setDrawerOpen(false);
    } catch (err) { showErrorToast(err instanceof Error ? err.message : String(err)); }
  };
  const handleDelete = async () => {
    if (!selectedChat) return;
    try { await deleteSelectedChat(); setDrawerOpen(false); }
    catch (err) { showErrorToast(err instanceof Error ? err.message : String(err)); }
  };
  const sendTurn = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || !selectedChatId || responding || selectedChat?.closedAt) return;
    setDraft(""); setError(null);
    const result = await sendMessage(trimmed);
    if (!result.ok && result.phase === "append") setError(result.error);
    else if (!result.ok && result.phase === "other") showErrorToast(result.error);
  }, [draft, responding, selectedChat?.closedAt, selectedChatId, sendMessage, showErrorToast]);

  const headerTitle = selectedChat?.title ?? "Related";
  const isPocket = selectedChat?.source === "pocket";
  const isClosed = !!selectedChat?.closedAt || isPocket;
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
          {selectedChat?.closedAt || isPocket ? (
            <Text style={styles.headerSubtitle}>
              {isPocket
                ? "Pocket"
                : selectedChat?.extractedAt
                  ? "Extracted"
                  : "Closed"}
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
            {isPocket
              ? "Pocket import — read-only transcript."
              : "This chat is closed. Start a new chat to keep talking."}
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

            <TextInput
              value={chatSearch}
              onChangeText={setChatSearch}
              placeholder="Search chats"
              placeholderTextColor={colors.fgSubtle}
              accessibilityLabel="Search chats"
              style={styles.drawerSearch}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />

            <View style={styles.drawerListWrap}>
              <FlatList
                data={filteredChatList}
                keyExtractor={(c) => c.id}
                style={styles.drawerList}
                contentContainerStyle={styles.drawerListContent}
                scrollEnabled={chatListScrollable}
                onLayout={(e) =>
                  setDrawerListHeight(e.nativeEvent.layout.height)
                }
                onContentSizeChange={(_, height) =>
                  setDrawerContentHeight(height)
                }
                ListEmptyComponent={
                  <Text style={styles.drawerEmpty}>
                    {chatList.length === 0
                      ? "No chats yet."
                      : "No matching chats."}
                  </Text>
                }
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      selectChat(item.id);
                      setDrawerOpen(false);
                    }}
                    style={[
                      styles.drawerRow,
                      item.id === selectedChatId && styles.drawerRowActive,
                    ]}
                  >
                    <View style={styles.drawerRowTitleRow}>
                      <Text style={styles.drawerRowTitle} numberOfLines={1}>
                        {item.title ?? "Untitled chat"}
                      </Text>
                      {item.source === "pocket" ? (
                        <Text style={styles.drawerRowBadge}>Pocket</Text>
                      ) : null}
                    </View>
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
              {drawerListOverflows ? (
                <View style={styles.drawerExpandFade} pointerEvents="box-none">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Show older chats"
                    onPress={() => setChatListExpanded(true)}
                    style={styles.drawerExpandBtn}
                  >
                    <Text style={styles.drawerExpandBtnLabel}>…</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

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
    flex: 1,
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
  drawerSearch: {
    marginHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: fontSizes.small,
    fontFamily: fonts.sans,
    color: colors.fg,
  },
  drawerListWrap: {
    flex: 1,
    minHeight: 0,
    position: "relative",
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
  drawerRowTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  drawerRowTitle: {
    flex: 1,
    fontSize: fontSizes.body,
    fontFamily: fonts.sansMedium,
    color: colors.fg,
  },
  drawerRowBadge: {
    fontSize: fontSizes.micro,
    fontFamily: fonts.sansMedium,
    color: colors.fgSubtle,
    textTransform: "uppercase",
    letterSpacing: 0.4,
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
  drawerExpandFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 28,
    paddingBottom: 8,
    alignItems: "center",
    backgroundColor: colors.surface,
    opacity: 0.96,
  },
  drawerExpandBtn: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadowSm,
  },
  drawerExpandBtnLabel: {
    fontSize: fontSizes.h2,
    lineHeight: 20,
    color: colors.fgMuted,
    fontFamily: fonts.sansBold,
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
