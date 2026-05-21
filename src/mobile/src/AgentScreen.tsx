import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  AgentService,
  AgentTurnResult,
  CandidateAction,
  CandidateSet,
  DecisionState,
  Relationship,
  SessionHandle,
  VoiceSessionManager,
} from "@related/shared";
import type { AudioCaptureHandle } from "./voice/ExpoAudioRecorder";
import { colors, fonts, fontSizes, lineHeights, radii } from "./ui/tokens";

interface StreamingAudioPlayer {
  push: (chunk: Uint8Array) => void;
  flush: () => Promise<void>;
  reset: () => void;
}

export interface AgentScreenProps {
  relationship: Relationship;
  agentService: AgentService;
  onBack: () => void;
  voiceSessionManager?: VoiceSessionManager;
  /** Native mic capture (expo-audio). Web falls back to MediaRecorder. */
  startMicCapture?: () => Promise<AudioCaptureHandle>;
  /** Buffers and plays TTS chunks during Engaged Pass voice turns. */
  createStreamingPlayer?: () => StreamingAudioPlayer;
}

type VoiceState = "idle" | "recording" | "thinking";

interface TranscriptUserTurn {
  role: "user";
  id: string;
  text: string;
  capturedIntent?: { content: string };
}
interface TranscriptAgentTurn {
  role: "agent";
  id: string;
  candidateSet: CandidateSet;
  spokenText?: string;
}
type TranscriptEntry = TranscriptUserTurn | TranscriptAgentTurn;

function generateSessionId(): string {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AgentScreen({
  relationship,
  agentService,
  onBack,
  voiceSessionManager,
  startMicCapture,
  createStreamingPlayer,
}: AgentScreenProps) {
  const sessionId = useMemo(generateSessionId, []);
  const [draft, setDraft] = useState("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [decisions, setDecisions] = useState<Record<string, DecisionState>>({});

  const voiceSessionRef = useRef<SessionHandle | null>(null);
  const micRef = useRef<AudioCaptureHandle | null>(null);
  const playerRef = useRef<StreamingAudioPlayer | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (voiceSessionManager && createStreamingPlayer) {
      playerRef.current = createStreamingPlayer();
    }
    return () => {
      voiceSessionRef.current?.close();
      voiceSessionRef.current = null;
      micRef.current?.stop();
      micRef.current = null;
      playerRef.current?.reset();
      playerRef.current = null;
      stopWebMediaCapture(mediaRecorderRef, mediaStreamRef);
    };
  }, [createStreamingPlayer, voiceSessionManager]);

  async function handleSend() {
    if (sending) return;
    const text = draft.trim();
    if (!text) return;

    setSending(true);
    setError(null);
    setDraft("");
    const userEntryId = `u-${Date.now()}`;
    setTranscript((prev) => [
      ...prev,
      { role: "user", id: userEntryId, text },
    ]);

    try {
      const intent = await agentService.captureIntentForTurn({
        userTurn: text,
        sessionId,
        relationshipId: relationship.id,
      });
      if (intent.captured && intent.content) {
        const capturedContent = intent.content;
        setTranscript((prev) =>
          prev.map((e) =>
            e.role === "user" && e.id === userEntryId
              ? { ...e, capturedIntent: { content: capturedContent } }
              : e,
          ),
        );
      }

      const set = await agentService.runEngagedTurn({
        relationshipId: relationship.id,
        userTurn: text,
        sessionId,
      });
      setTranscript((prev) => [
        ...prev,
        { role: "agent", id: set.id, candidateSet: set },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setSending(false);
    }
  }

  async function beginMicCapture(): Promise<AudioCaptureHandle> {
    if (startMicCapture) return startMicCapture();
    return startWebMediaCapture(mediaRecorderRef, mediaStreamRef);
  }

  async function handleVoiceToggle() {
    if (!voiceSessionManager) return;
    setError(null);

    if (voiceState === "thinking") {
      voiceSessionRef.current?.interrupt();
      playerRef.current?.reset();
      return;
    }

    if (voiceState === "recording") {
      micRef.current?.stop();
      setVoiceState("thinking");
      return;
    }

    let mic: AudioCaptureHandle;
    try {
      mic = await beginMicCapture();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start microphone.",
      );
      return;
    }
    micRef.current = mic;
    setVoiceState("recording");

    const handle = voiceSessionManager.startSession({
      relationshipId: relationship.id,
    });
    voiceSessionRef.current = handle;

    const player = playerRef.current;
    if (player) {
      handle.onAgentResponse((chunk) => {
        player.push(chunk);
      });
    }

    handle
      .onUserTurn(mic.audio)
      .then((result: AgentTurnResult) => {
        if (voiceSessionRef.current !== handle) return;
        setTranscript((prev) => [
          ...prev,
          {
            role: "user",
            id: `u-voice-${Date.now()}`,
            text: result.text ? "" : "(voice turn)",
          },
          {
            role: "agent",
            id: result.candidateSet.id,
            candidateSet: result.candidateSet,
            spokenText: result.text,
          },
        ]);
        if (player) {
          void player.flush().catch((err) => {
            setError(
              err instanceof Error ? err.message : "Audio playback failed.",
            );
          });
        }
      })
      .catch((err: Error) => {
        if (voiceSessionRef.current !== handle) return;
        if (err.name !== "InterruptedError") {
          setError(err.message);
        }
      })
      .finally(() => {
        if (micRef.current === mic) {
          mic.stop();
          micRef.current = null;
        }
        if (voiceSessionRef.current === handle) {
          voiceSessionRef.current = null;
        }
        setVoiceState("idle");
      });
  }

  async function handleDecision(
    action: CandidateAction,
    intent: "accept" | "decline",
    edits?: Record<string, unknown>,
  ) {
    const effectiveAction =
      intent === "decline"
        ? { ...action, type: "DoNothing" as const, payload: {} }
        : action;

    let userEditsPayload = edits;
    if (intent === "accept" && effectiveAction.type === "SendMessage") {
      const channel = (effectiveAction.payload as { channel?: string })?.channel;
      const resolved = resolveRecipientFor(relationship, channel);
      userEditsPayload = { ...(edits ?? {}), to: resolved };
    }

    try {
      await agentService.executeAction({
        action: {
          id: action.id,
          candidateSetId: findCandidateSetIdFor(transcript, action.id) ?? "",
          ownerId: "",
          type: effectiveAction.type,
          payload: effectiveAction.payload,
        },
        userEdits: userEditsPayload ? { payload: userEditsPayload } : undefined,
      });
      setDecisions((prev) => ({
        ...prev,
        [action.id]: intent === "accept" ? "picked" : "declined",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    }
  }

  const voiceAccessibilityLabel =
    voiceState === "recording"
      ? "Stop recording"
      : voiceState === "thinking"
        ? "Cancel voice"
        : "Start voice";

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
          <Text style={styles.backLabel}>‹ Back</Text>
        </Pressable>
        <Text style={styles.name}>{relationship.contact.name}</Text>
        <Text style={styles.eyebrow}>Engaged Pass</Text>

        {transcript.map((entry) =>
          entry.role === "user" ? (
            <View key={entry.id}>
              <View style={styles.userBubble}>
                <Text style={styles.userBubbleText}>
                  {entry.text || "(voice turn)"}
                </Text>
              </View>
              {entry.capturedIntent ? (
                <Text style={styles.intentAnnotation}>
                  Intent: {entry.capturedIntent.content}
                </Text>
              ) : null}
            </View>
          ) : (
            <View key={entry.id} style={styles.agentBlock}>
              {entry.spokenText ? (
                <Text style={styles.spokenText}>{entry.spokenText}</Text>
              ) : null}
              {entry.candidateSet.actions.map((a) => (
                <CandidateCard
                  key={a.id}
                  action={a}
                  decisionState={decisions[a.id] ?? "pending"}
                  onAccept={(edits) => handleDecision(a, "accept", edits)}
                  onDecline={() => handleDecision(a, "decline")}
                />
              ))}
            </View>
          ),
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.composerOuter}>
        <View style={styles.composerRow}>
          <TextInput
            style={styles.composerInput}
            placeholder="Message the agent…"
            placeholderTextColor={colors.fgSubtle}
            value={draft}
            onChangeText={setDraft}
            editable={!sending && voiceState === "idle"}
            multiline
          />
          {voiceSessionManager ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={voiceAccessibilityLabel}
              onPress={handleVoiceToggle}
              style={[
                styles.iconButton,
                voiceState === "recording" && styles.iconButtonRecording,
                voiceState === "thinking" && styles.iconButtonThinking,
              ]}
            >
              {voiceState === "thinking" ? (
                <ActivityIndicator size="small" color={colors.fgSubtle} />
              ) : (
                <Text style={styles.micLabel}>
                  {voiceState === "recording" ? "■" : "●"}
                </Text>
              )}
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            onPress={handleSend}
            disabled={sending || !draft.trim() || voiceState !== "idle"}
            style={[
              styles.sendBtn,
              (sending || !draft.trim() || voiceState !== "idle") &&
                styles.sendBtnDisabled,
            ]}
          >
            <Text style={styles.sendLabel}>Send</Text>
          </Pressable>
        </View>
        {voiceSessionManager ? (
          <Text style={styles.voiceHint}>
            {voiceState === "recording"
              ? "Recording… tap the square to stop."
              : voiceState === "thinking"
                ? "Thinking… tap to cancel."
                : "Tap the mic to start a voice turn."}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

async function startWebMediaCapture(
  recorderRef: React.MutableRefObject<MediaRecorder | null>,
  streamRef: React.MutableRefObject<MediaStream | null>,
): Promise<AudioCaptureHandle> {
  const nav =
    typeof navigator !== "undefined" ? navigator : (undefined as never);
  if (!nav?.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("Microphone unavailable on this platform.");
  }

  const stopped = new Promise<Blob>((resolve, reject) => {
    nav.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        streamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        recorderRef.current = recorder;
        const blobs: Blob[] = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) blobs.push(ev.data);
        };
        recorder.onstop = () => {
          resolve(
            new Blob(blobs, { type: recorder.mimeType || "audio/webm" }),
          );
        };
        recorder.onerror = (ev) =>
          reject(
            (ev as unknown as { error?: Error })?.error ??
              new Error("MediaRecorder error"),
          );
        recorder.start();
      })
      .catch(reject);
  });

  const stop = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* noop */
      }
    }
  };

  const audio: AsyncIterable<Uint8Array> = (async function* iterate() {
    const blob = await stopped;
    const buf = await blob.arrayBuffer();
    yield new Uint8Array(buf);
  })();

  return { audio, stop };
}

function stopWebMediaCapture(
  recorderRef: React.MutableRefObject<MediaRecorder | null>,
  streamRef: React.MutableRefObject<MediaStream | null>,
): void {
  const recorder = recorderRef.current;
  if (recorder && recorder.state !== "inactive") {
    try {
      recorder.stop();
    } catch {
      /* noop */
    }
  }
  recorderRef.current = null;
  const stream = streamRef.current;
  if (stream) {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        /* noop */
      }
    }
  }
  streamRef.current = null;
}

function resolveRecipientFor(
  relationship: Relationship,
  channel: string | undefined,
): string[] {
  const contact = relationship.contact;
  if (channel === "email" && contact.email) return [contact.email];
  if (channel === "text" && contact.phone) return [contact.phone];
  return [];
}

function findCandidateSetIdFor(
  transcript: TranscriptEntry[],
  actionId: string,
): string | null {
  for (const entry of transcript) {
    if (entry.role !== "agent") continue;
    if (entry.candidateSet.actions.some((a) => a.id === actionId)) {
      return entry.candidateSet.id;
    }
  }
  return null;
}

interface CandidateCardProps {
  action: CandidateAction;
  decisionState: DecisionState;
  onAccept: (edits?: Record<string, unknown>) => void;
  onDecline: () => void;
}

function payloadAsRecord(action: CandidateAction): Record<string, unknown> {
  const p = action.payload;
  if (p && typeof p === "object" && !Array.isArray(p)) {
    return p as Record<string, unknown>;
  }
  return {};
}

function CandidateCard({
  action,
  decisionState,
  onAccept,
  onDecline,
}: CandidateCardProps) {
  const decided = decisionState !== "pending";
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, unknown>>(() =>
    payloadAsRecord(action),
  );

  const scalarFields = Object.entries(payloadAsRecord(action)).filter(
    ([, v]) => typeof v === "string",
  );

  return (
    <View style={styles.card}>
      <Text style={styles.cardType}>{action.type}</Text>
      {action.why ? <Text style={styles.cardWhy}>{action.why}</Text> : null}

      {editing ? (
        <View style={styles.editBlock}>
          {scalarFields.map(([key, value]) => (
            <View key={key} style={styles.editFieldRow}>
              <Text style={styles.editFieldLabel}>{key}</Text>
              <TextInput
                style={styles.editFieldInput}
                value={(edits[key] as string) ?? (value as string)}
                onChangeText={(next) =>
                  setEdits((prev) => ({ ...prev, [key]: next }))
                }
                multiline={key === "body" || key === "notes" || key === "description"}
              />
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.cardActions}>
        {decided ? (
          <Text style={styles.decidedBadge}>
            {decisionState === "picked" ? "Accepted" : "Declined"}
          </Text>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => onAccept(editing ? edits : undefined)}
              style={styles.acceptBtn}
            >
              <Text style={styles.acceptLabel}>Accept</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onDecline}
              style={styles.declineBtn}
            >
              <Text style={styles.declineLabel}>Decline</Text>
            </Pressable>
            {scalarFields.length > 0 && !editing ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setEditing(true)}
                style={styles.editBtn}
              >
                <Text style={styles.editLabel}>Edit</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24 },
  back: { marginBottom: 12, alignSelf: "flex-start" },
  backLabel: {
    color: colors.fgMuted,
    fontSize: fontSizes.body,
    fontFamily: fonts.sansMedium,
  },
  name: {
    fontSize: fontSizes.display,
    lineHeight: lineHeights.display,
    fontFamily: fonts.sansBold,
    color: colors.fg,
    marginBottom: 4,
  },
  eyebrow: {
    fontSize: fontSizes.micro,
    lineHeight: lineHeights.micro,
    fontFamily: fonts.sansMedium,
    color: colors.fgSubtle,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 24,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    maxWidth: "85%",
  },
  userBubbleText: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontFamily: fonts.sans,
    color: colors.fgOnAccent,
  },
  intentAnnotation: {
    alignSelf: "flex-end",
    fontSize: fontSizes.micro,
    fontFamily: fonts.sansMedium,
    color: colors.accent,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: -8,
    marginBottom: 8,
    marginRight: 4,
    maxWidth: "85%",
  },
  agentBlock: { marginBottom: 12 },
  spokenText: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontFamily: fonts.sans,
    color: colors.fg,
    marginBottom: 8,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    backgroundColor: colors.surface,
  },
  cardType: {
    fontSize: fontSizes.body,
    fontFamily: fonts.sansMedium,
    color: colors.fg,
  },
  cardWhy: {
    fontSize: fontSizes.small,
    fontFamily: fonts.sans,
    color: colors.fgMuted,
    marginTop: 4,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    flexWrap: "wrap",
    gap: 8,
  },
  acceptBtn: {
    backgroundColor: colors.fg,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  acceptLabel: {
    color: colors.fgOnAccent,
    fontSize: fontSizes.small,
    fontFamily: fonts.sansMedium,
  },
  declineBtn: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.bg,
  },
  declineLabel: {
    color: colors.fg,
    fontSize: fontSizes.small,
    fontFamily: fonts.sansMedium,
  },
  decidedBadge: {
    fontSize: fontSizes.micro,
    fontFamily: fonts.sansMedium,
    color: colors.fgSubtle,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  editBtn: {
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  editLabel: {
    color: colors.accent,
    fontSize: fontSizes.small,
    fontFamily: fonts.sansMedium,
  },
  editBlock: { marginTop: 10 },
  editFieldRow: { marginBottom: 8 },
  editFieldLabel: {
    fontSize: fontSizes.micro,
    fontFamily: fonts.sansMedium,
    color: colors.fgSubtle,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  editFieldInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: fontSizes.body,
    fontFamily: fonts.sans,
    color: colors.fg,
    backgroundColor: colors.bg,
  },
  error: {
    marginTop: 12,
    color: colors.danger,
    fontSize: fontSizes.small,
    fontFamily: fonts.sans,
  },
  composerOuter: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  composerInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontFamily: fonts.sans,
    color: colors.fg,
    paddingVertical: 4,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  iconButtonRecording: {
    backgroundColor: colors.danger,
  },
  iconButtonThinking: {
    backgroundColor: colors.surface2,
  },
  micLabel: {
    fontSize: fontSizes.body,
    color: colors.fgOnAccent,
    fontFamily: fonts.sansBold,
  },
  sendBtn: {
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 56,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendLabel: {
    color: colors.fgOnAccent,
    fontSize: fontSizes.small,
    fontFamily: fonts.sansMedium,
  },
  voiceHint: {
    marginTop: 6,
    fontSize: fontSizes.micro,
    fontFamily: fonts.sans,
    color: colors.fgSubtle,
    textAlign: "center",
  },
});
