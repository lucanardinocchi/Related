import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  InteractionsClient,
  OpenThread,
  OpenThreadsClient,
  Relationship,
  RelationshipsClient,
  ThreadDirection,
} from "@related/shared";

export interface RelationshipDetailScreenProps {
  relationship: Relationship;
  openThreadsClient: OpenThreadsClient;
  relationshipsClient: RelationshipsClient;
  interactionsClient: InteractionsClient;
  onBack: () => void;
}

const STRAVA_ORANGE = "#FC4C02";
const FONT_REGULAR = "InterTight_400Regular";
const FONT_BOLD = "InterTight_700Bold";
const FONT_BLACK = "InterTight_900Black";

function directionLabel(direction: ThreadDirection): string {
  return direction === "me_owes_them" ? "You owe" : "They owe";
}

export function RelationshipDetailScreen({
  relationship,
  openThreadsClient,
  relationshipsClient,
  interactionsClient,
  onBack,
}: RelationshipDetailScreenProps) {
  const { contact } = relationship;

  const [threads, setThreads] = useState<OpenThread[]>([]);
  const [allRelationships, setAllRelationships] = useState<Relationship[]>([]);

  const [description, setDescription] = useState("");
  const [direction, setDirection] = useState<ThreadDirection>("me_owes_them");
  const [extraRelationshipIds, setExtraRelationshipIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline log-Interaction form: kind + ISO time + optional notes, bound to
  // status="occurred" (logging a past Interaction). Scheduling a planned
  // Interaction goes through the Calendar tab in a later slice; this screen
  // is the "stub action in the Single Relationship view" called out by the
  // Slice 4 issue.
  const [interactionKind, setInteractionKind] = useState("");
  const [interactionTime, setInteractionTime] = useState("");
  const [interactionNotes, setInteractionNotes] = useState("");
  const [logging, setLogging] = useState(false);

  const reloadThreads = useCallback(async () => {
    const next = await openThreadsClient.listOpenForRelationship(
      relationship.id,
    );
    setThreads(next);
  }, [openThreadsClient, relationship.id]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      openThreadsClient.listOpenForRelationship(relationship.id),
      relationshipsClient.listRelationships(),
    ])
      .then(([nextThreads, rels]) => {
        if (cancelled) return;
        setThreads(nextThreads);
        setAllRelationships(rels);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Could not load this thread.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [openThreadsClient, relationshipsClient, relationship.id]);

  async function handleClose(threadId: string) {
    try {
      await openThreadsClient.closeOpenThread(threadId);
      await reloadThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close thread.");
    }
  }

  async function handleCreate() {
    if (submitting) return;
    if (!description.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await openThreadsClient.createOpenThread({
        description: description.trim(),
        direction,
        relationshipIds: [relationship.id, ...extraRelationshipIds],
      });
      setDescription("");
      setExtraRelationshipIds([]);
      setDirection("me_owes_them");
      await reloadThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create thread.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogInteraction() {
    if (logging) return;
    if (!interactionKind.trim() || !interactionTime.trim()) return;
    setLogging(true);
    setError(null);
    try {
      await interactionsClient.createInteraction({
        time: interactionTime.trim(),
        kind: interactionKind.trim(),
        notes: interactionNotes.trim() ? interactionNotes.trim() : null,
        status: "occurred",
        contactIds: [contact.id],
      });
      setInteractionKind("");
      setInteractionTime("");
      setInteractionNotes("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not log interaction.",
      );
    } finally {
      setLogging(false);
    }
  }

  function toggleExtra(id: string) {
    setExtraRelationshipIds((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id],
    );
  }

  const pickerOptions = allRelationships.filter(
    (r) => r.id !== relationship.id,
  );

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
        <Text style={styles.backLabel}>‹ Back</Text>
      </Pressable>

      <Text style={styles.name}>{contact.name}</Text>

      {contact.phone ? (
        <View style={styles.channelRow}>
          <Text style={styles.channelLabel}>Phone</Text>
          <Text style={styles.channelValue}>{contact.phone}</Text>
        </View>
      ) : null}

      {contact.email ? (
        <View style={styles.channelRow}>
          <Text style={styles.channelLabel}>Email</Text>
          <Text style={styles.channelValue}>{contact.email}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionHeading}>Open threads</Text>
      {threads.length === 0 ? (
        <Text style={styles.empty}>No open threads</Text>
      ) : (
        threads.map((t) => (
          <View key={t.id} style={styles.threadRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.threadDirection}>
                {directionLabel(t.direction)}
              </Text>
              <Text style={styles.threadDescription}>{t.description}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => handleClose(t.id)}
              style={styles.closeBtn}
            >
              <Text style={styles.closeLabel}>Close</Text>
            </Pressable>
          </View>
        ))
      )}

      <Text style={styles.sectionHeading}>New interaction</Text>
      <TextInput
        style={styles.input}
        placeholder="Kind (coffee, call, dinner…)"
        placeholderTextColor="#9ca3af"
        value={interactionKind}
        onChangeText={setInteractionKind}
      />
      <TextInput
        style={styles.input}
        placeholder="When (ISO 8601)"
        placeholderTextColor="#9ca3af"
        value={interactionTime}
        onChangeText={setInteractionTime}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Notes (optional)"
        placeholderTextColor="#9ca3af"
        value={interactionNotes}
        onChangeText={setInteractionNotes}
      />
      <Pressable
        accessibilityRole="button"
        onPress={handleLogInteraction}
        disabled={logging}
        style={[styles.submit, logging && styles.submitDisabled]}
      >
        <Text style={styles.submitLabel}>Log interaction</Text>
      </Pressable>

      <Text style={styles.sectionHeading}>New thread</Text>
      <TextInput
        style={styles.input}
        placeholder="Description"
        placeholderTextColor="#9ca3af"
        value={description}
        onChangeText={setDescription}
      />
      <View style={styles.directionRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setDirection("me_owes_them")}
          style={[
            styles.directionChip,
            direction === "me_owes_them" && styles.directionChipActive,
          ]}
        >
          <Text
            style={[
              styles.directionLabel,
              direction === "me_owes_them" && styles.directionLabelActive,
            ]}
          >
            I owe them
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setDirection("they_owe_me")}
          style={[
            styles.directionChip,
            direction === "they_owe_me" && styles.directionChipActive,
          ]}
        >
          <Text
            style={[
              styles.directionLabel,
              direction === "they_owe_me" && styles.directionLabelActive,
            ]}
          >
            They owe me
          </Text>
        </Pressable>
      </View>

      {pickerOptions.length > 0 ? (
        <View style={styles.pickerBlock}>
          <Text style={styles.pickerHeading}>Also linked to</Text>
          {pickerOptions.map((r) => {
            const checked = extraRelationshipIds.includes(r.id);
            return (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                onPress={() => toggleExtra(r.id)}
                style={styles.pickerRow}
              >
                <Text style={styles.pickerCheck}>{checked ? "☑" : "☐"}</Text>
                <Text style={styles.pickerName}>{r.contact.name}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={handleCreate}
        disabled={submitting}
        style={[styles.submit, submitting && styles.submitDisabled]}
      >
        <Text style={styles.submitLabel}>Create thread</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ffffff" },
  content: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 48 },
  back: { marginBottom: 12, alignSelf: "flex-start" },
  backLabel: {
    color: "#6b7280",
    fontSize: 14,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
  },
  name: {
    fontSize: 36,
    fontFamily: FONT_BLACK,
    fontWeight: "900",
    color: "#000",
    letterSpacing: -1,
    marginBottom: 24,
  },
  channelRow: { marginBottom: 16 },
  channelLabel: {
    fontSize: 10,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#9ca3af",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  channelValue: {
    fontSize: 16,
    fontFamily: FONT_REGULAR,
    color: "#000",
  },
  sectionHeading: {
    fontSize: 12,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginTop: 24,
    marginBottom: 12,
  },
  empty: {
    fontSize: 14,
    fontFamily: FONT_REGULAR,
    color: "#9ca3af",
  },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  threadDirection: {
    fontSize: 10,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: STRAVA_ORANGE,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  threadDescription: {
    fontSize: 14,
    fontFamily: FONT_REGULAR,
    color: "#000",
  },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  closeLabel: {
    fontSize: 12,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#374151",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: FONT_REGULAR,
    marginBottom: 12,
  },
  directionRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  directionChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d1d5db",
    marginRight: 8,
  },
  directionChipActive: {
    backgroundColor: STRAVA_ORANGE,
    borderColor: STRAVA_ORANGE,
  },
  directionLabel: {
    fontSize: 12,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#374151",
  },
  directionLabelActive: {
    color: "#ffffff",
  },
  pickerBlock: {
    marginBottom: 16,
  },
  pickerHeading: {
    fontSize: 11,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  pickerCheck: {
    fontSize: 18,
    marginRight: 10,
    color: "#000",
  },
  pickerName: {
    fontSize: 15,
    fontFamily: FONT_REGULAR,
    color: "#000",
  },
  submit: {
    backgroundColor: STRAVA_ORANGE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  submitDisabled: { opacity: 0.6 },
  submitLabel: {
    fontSize: 14,
    fontFamily: FONT_BLACK,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 0.4,
  },
  error: {
    marginTop: 16,
    color: "#dc2626",
    fontSize: 13,
    fontFamily: FONT_REGULAR,
  },
});
