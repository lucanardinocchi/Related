import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  Group,
  GroupsClient,
  Relationship,
  RelationshipsClient,
} from "@related/shared";

export interface CreateGroupScreenProps {
  groupsClient: GroupsClient;
  relationshipsClient: RelationshipsClient;
  onCreated: (group: Group) => void;
  onCancel: () => void;
}

const STRAVA_ORANGE = "#FC4C02";
const FONT_REGULAR = "InterTight_400Regular";
const FONT_BOLD = "InterTight_700Bold";
const FONT_BLACK = "InterTight_900Black";

export function CreateGroupScreen({
  groupsClient,
  relationshipsClient,
  onCreated,
  onCancel,
}: CreateGroupScreenProps) {
  const [name, setName] = useState("");
  const [candidates, setCandidates] = useState<Relationship[]>([]);
  const [pickedContactIds, setPickedContactIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    relationshipsClient
      .listRelationships()
      .then((rs) => {
        if (!cancelled) setCandidates(rs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [relationshipsClient]);

  function togglePick(id: string) {
    setPickedContactIds((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id],
    );
  }

  async function handleSave() {
    if (submitting) return;
    if (!name.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const group = await groupsClient.createGroup({ name: name.trim() });
      // Link picked members in parallel; an addMember failure leaves the
      // Group created but partially populated — surface the message and let
      // the user retry on the Group detail view.
      await Promise.all(
        pickedContactIds.map((contactId) =>
          groupsClient.addMember({ groupId: group.id, contactId }),
        ),
      );
      onCreated(group);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create group.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>New group</Text>
      <TextInput
        style={styles.input}
        placeholder="Name"
        placeholderTextColor="#9ca3af"
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.sectionLabel}>Members</Text>
      {candidates.length === 0 ? (
        <Text style={styles.empty}>No contacts to add yet</Text>
      ) : (
        candidates.map((r) => {
          const picked = pickedContactIds.includes(r.contact.id);
          return (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              onPress={() => togglePick(r.contact.id)}
              style={styles.pickerRow}
            >
              <Text style={styles.pickerCheck}>{picked ? "☑" : "☐"}</Text>
              <Text style={styles.pickerName}>{r.contact.name}</Text>
            </Pressable>
          );
        })
      )}

      <Pressable
        accessibilityRole="button"
        style={[styles.primary, submitting && styles.primaryDisabled]}
        onPress={handleSave}
        disabled={submitting}
      >
        <Text style={styles.primaryLabel}>Create</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={styles.cancel}
        onPress={onCancel}
      >
        <Text style={styles.cancelLabel}>Cancel</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ffffff" },
  content: { paddingHorizontal: 24, paddingTop: 96, paddingBottom: 48 },
  heading: {
    fontSize: 28,
    fontFamily: FONT_BLACK,
    fontWeight: "900",
    color: "#000",
    letterSpacing: -0.5,
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: FONT_REGULAR,
    color: "#000",
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 8,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
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
  empty: {
    fontSize: 13,
    fontFamily: FONT_REGULAR,
    color: "#9ca3af",
  },
  primary: {
    backgroundColor: STRAVA_ORANGE,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  primaryDisabled: { opacity: 0.6 },
  primaryLabel: {
    color: "#ffffff",
    fontSize: 16,
    fontFamily: FONT_BLACK,
    fontWeight: "900",
  },
  cancel: { marginTop: 12, alignSelf: "center" },
  cancelLabel: {
    color: "#6b7280",
    fontSize: 13,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
  },
  error: {
    marginTop: 16,
    color: "#dc2626",
    fontSize: 14,
    fontFamily: FONT_REGULAR,
  },
});
