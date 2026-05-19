import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  AgentService,
  CandidateAction,
  CandidateSet,
  DecisionState,
  Relationship,
} from "@related/shared";

export interface AgentScreenProps {
  relationship: Relationship;
  agentService: AgentService;
  onBack: () => void;
}

const STRAVA_ORANGE = "#FC4C02";
const FONT_REGULAR = "InterTight_400Regular";
const FONT_BOLD = "InterTight_700Bold";
const FONT_BLACK = "InterTight_900Black";

interface TranscriptUserTurn {
  role: "user";
  id: string;
  text: string;
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
}: AgentScreenProps) {
  const sessionId = useMemo(generateSessionId, []);
  const [draft, setDraft] = useState("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    try {
      await agentService.executeAction({
        action: {
          id: action.id,
          candidateSetId: findCandidateSetIdFor(transcript, action.id) ?? "",
          ownerId: "",
          type: effectiveAction.type,
          payload: effectiveAction.payload,
        },
        userEdits: edits ? { payload: edits } : undefined,
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
            <View key={entry.id} style={styles.userBubble}>
              <Text style={styles.userBubbleText}>{entry.text}</Text>
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
      </View>
    </View>
  );
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
});
