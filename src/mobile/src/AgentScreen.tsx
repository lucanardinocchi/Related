import { useEffect, useMemo, useRef, useState } from "react";
import {
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

/**
 * Voice mode notes for this slice:
 * - Real microphone capture is **web-only** in this slice. On web we use
 *   `MediaRecorder` to capture an `audio/webm` blob, feed it as a single
 *   async-iterable chunk to the session, and let `OpenAIWhisperSTTAdapter`
 *   ship it to the `voice-stt` Edge Function.
 * - On native (iOS / Android) the AgentScreen still renders the Mic
 *   toggle when a `voiceSessionManager` is provided so the UX stays
 *   uniform, but the press is a no-op aside from starting a session —
 *   native audio capture lands with the iOS-native build.
 */

export interface AgentScreenProps {
  relationship: Relationship;
  agentService: AgentService;
  onBack: () => void;
  /**
   * Optional. If provided, the screen renders a Mic button next to
   * Send and routes voice turns through this manager. If omitted the
   * screen runs text-only — exactly the pre-Slice-E behaviour.
   */
  voiceSessionManager?: VoiceSessionManager;
}

const STRAVA_ORANGE = "#FC4C02";
const FONT_REGULAR = "InterTight_400Regular";
const FONT_BOLD = "InterTight_700Bold";
const FONT_BLACK = "InterTight_900Black";

interface TranscriptUserTurn {
  role: "user";
  id: string;
  text: string;
  /** Set when the User's turn produced a captured Transient Intent. */
  capturedIntent?: { content: string };
}
interface TranscriptAgentTurn {
  role: "agent";
  id: string;
  candidateSet: CandidateSet;
}
type TranscriptEntry = TranscriptUserTurn | TranscriptAgentTurn;

function generateSessionId(): string {
  // Math.random is fine — sessionId only needs to be unique within the
  // User's account scope and within a few-hour window. Cryptographic
  // uniqueness isn't required.
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AgentScreen({
  relationship,
  agentService,
  onBack,
  voiceSessionManager,
}: AgentScreenProps) {
  const sessionId = useMemo(generateSessionId, []);
  const [draft, setDraft] = useState("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Voice mode state. Idle: no active session. Active: a voice turn is
   * in flight (mic open, agent talking, or anything in between). Errors
   * are surfaced via the shared `error` state.
   */
  const [voiceState, setVoiceState] = useState<"idle" | "active">("idle");
  const voiceSessionRef = useRef<SessionHandle | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Tear down the voice session if the screen unmounts mid-turn so we
  // don't leak the mic / underlying iterators.
  useEffect(() => {
    return () => {
      voiceSessionRef.current?.close();
      voiceSessionRef.current = null;
      stopMediaCapture(mediaRecorderRef, mediaStreamRef);
    };
  }, []);
  /**
   * Tracks the User's decision per candidate id, so the card can show
   * "Accepted" / "Declined" badges and hide the action buttons after pick.
   */
  const [decisions, setDecisions] = useState<Record<string, DecisionState>>({});

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
      // Capture Transient Intent FIRST so the just-written intent is
      // included in the UserContext snapshot for the same Pass.
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

  async function handleVoiceToggle() {
    if (!voiceSessionManager) return;

    // Tap-during-active-turn → barge-in.
    if (voiceState === "active") {
      voiceSessionRef.current?.interrupt();
      stopMediaCapture(mediaRecorderRef, mediaStreamRef);
      return;
    }

    setError(null);
    setVoiceState("active");
    const handle = voiceSessionManager.startSession({
      relationshipId: relationship.id,
    });
    voiceSessionRef.current = handle;
    handle.onAgentResponse((chunk) => {
      // Pipe audio chunks into the platform playback surface. On web we
      // can wire up a MediaSource buffer; for this slice we just consume
      // chunks (real playback wiring is incremental). Keeping the
      // callback registered means the manager doesn't backpressure.
      void chunk;
    });

    const audio = startMediaCapture(mediaRecorderRef, mediaStreamRef);

    handle
      .onUserTurn(audio)
      .then((result: AgentTurnResult) => {
        if (voiceSessionRef.current !== handle) return;
        setTranscript((prev) => [
          ...prev,
          { role: "user", id: `u-voice-${Date.now()}`, text: result.text },
          {
            role: "agent",
            id: result.candidateSet.id,
            candidateSet: result.candidateSet,
          },
        ]);
      })
      .catch((err: Error) => {
        if (voiceSessionRef.current !== handle) return;
        if (err.name !== "InterruptedError") {
          setError(err.message);
        }
      })
      .finally(() => {
        stopMediaCapture(mediaRecorderRef, mediaStreamRef);
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
    // Decline routes through the DoNothing branch — the Executor records the
    // decline against the action's id, and the agent's continuity bias sees
    // a declined non-DoNothing as "don't re-propose unchanged".
    const effectiveAction =
      intent === "decline"
        ? { ...action, type: "DoNothing" as const, payload: {} }
        : action;

    // SendMessage Accept: the agent emits `contactIds` only — it has no
    // way to know phone numbers. Resolve the focused Contact's channel
    // address here so the Executor can hand off to the system composer.
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

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
          <Text style={styles.backLabel}>‹ Back</Text>
        </Pressable>
        <Text style={styles.name}>{relationship.contact.name}</Text>

        {transcript.map((entry) =>
          entry.role === "user" ? (
            <View key={entry.id}>
              <View style={styles.userBubble}>
                <Text style={styles.userBubbleText}>{entry.text}</Text>
              </View>
              {entry.capturedIntent ? (
                <Text style={styles.intentAnnotation}>
                  Intent: {entry.capturedIntent.content}
                </Text>
              ) : null}
            </View>
          ) : (
            <View key={entry.id} style={styles.agentBlock}>
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
      <View style={styles.composerRow}>
        <TextInput
          style={styles.composerInput}
          placeholder="Say something to Claude…"
          placeholderTextColor="#9ca3af"
          value={draft}
          onChangeText={setDraft}
          editable={!sending}
        />
        <Pressable
          accessibilityRole="button"
          onPress={handleSend}
          disabled={sending}
          style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
        >
          <Text style={styles.sendLabel}>Send</Text>
        </Pressable>
        {voiceSessionManager ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              voiceState === "active" ? "Stop voice" : "Start voice"
            }
            onPress={handleVoiceToggle}
            style={[
              styles.micBtn,
              voiceState === "active" && styles.micBtnActive,
            ]}
          >
            <Text
              style={[
                styles.micLabel,
                voiceState === "active" && styles.micLabelActive,
              ]}
            >
              {voiceState === "active" ? "■" : "🎙"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Begins mic capture on web via `MediaRecorder` and returns an
 * async-iterable that yields the recorded audio bytes after the
 * recorder stops. The current iterable yields exactly one chunk (the
 * full blob). v1's `OpenAIWhisperSTTAdapter` accumulates chunks before
 * POSTing anyway, so partial yields would not change behaviour.
 *
 * On non-web platforms this is a no-op that yields nothing; mic
 * capture lands with the iOS-native build.
 */
function startMediaCapture(
  recorderRef: React.MutableRefObject<MediaRecorder | null>,
  streamRef: React.MutableRefObject<MediaStream | null>,
): AsyncIterable<Uint8Array> {
  if (Platform.OS !== "web") {
    return (async function* empty() {})();
  }
  const nav =
    typeof navigator !== "undefined" ? navigator : (undefined as never);
  if (!nav?.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    return (async function* empty() {})();
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
          const merged = new Blob(blobs, {
            type: recorder.mimeType || "audio/webm",
          });
          resolve(merged);
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

  return (async function* iterate() {
    const blob = await stopped;
    const buf = await blob.arrayBuffer();
    yield new Uint8Array(buf);
  })();
}

function stopMediaCapture(
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

/**
 * Returns the action's payload as an object so we can iterate over its
 * scalar fields. `payload` on CandidateAction is typed `unknown` to keep
 * the agent's tool-use schema flexible — narrow here defensively.
 */
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
  root: { flex: 1, backgroundColor: "#ffffff" },
  content: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24 },
  back: { marginBottom: 12, alignSelf: "flex-start" },
  backLabel: {
    color: "#6b7280",
    fontSize: 14,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
  },
  name: {
    fontSize: 32,
    fontFamily: FONT_BLACK,
    fontWeight: "900",
    color: "#000",
    letterSpacing: -1,
    marginBottom: 24,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#f3f4f6",
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    maxWidth: "85%",
  },
  userBubbleText: {
    fontSize: 14,
    fontFamily: FONT_REGULAR,
    color: "#111827",
  },
  intentAnnotation: {
    alignSelf: "flex-end",
    fontSize: 10,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: STRAVA_ORANGE,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 4,
    marginBottom: 8,
    marginRight: 4,
    maxWidth: "85%",
  },
  agentBlock: { marginBottom: 12 },
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  cardType: {
    fontSize: 14,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#000",
  },
  cardWhy: {
    fontSize: 12,
    fontFamily: FONT_REGULAR,
    color: "#6b7280",
    marginTop: 4,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  acceptBtn: {
    backgroundColor: STRAVA_ORANGE,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginRight: 8,
  },
  acceptLabel: {
    color: "#ffffff",
    fontSize: 12,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  declineBtn: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  declineLabel: {
    color: "#374151",
    fontSize: 12,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
  },
  decidedBadge: {
    fontSize: 11,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  editBtn: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginLeft: 8,
  },
  editLabel: {
    color: STRAVA_ORANGE,
    fontSize: 12,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
  },
  editBlock: {
    marginTop: 10,
  },
  editFieldRow: {
    marginBottom: 8,
  },
  editFieldLabel: {
    fontSize: 10,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  editFieldInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: FONT_REGULAR,
  },
  error: {
    marginTop: 12,
    color: "#dc2626",
    fontSize: 13,
    fontFamily: FONT_REGULAR,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    backgroundColor: "#ffffff",
  },
  composerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: FONT_REGULAR,
    marginRight: 8,
  },
  sendBtn: {
    backgroundColor: STRAVA_ORANGE,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendLabel: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: FONT_BLACK,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  micBtn: {
    marginLeft: 8,
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  micBtnActive: {
    backgroundColor: STRAVA_ORANGE,
    borderColor: STRAVA_ORANGE,
  },
  micLabel: {
    fontSize: 18,
    color: "#374151",
  },
  micLabelActive: {
    color: "#ffffff",
  },
});
