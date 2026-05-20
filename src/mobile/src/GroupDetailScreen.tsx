import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type {
  GroupMember,
  GroupRelationship,
  GroupsClient,
  Interaction,
  InteractionsClient,
  OpenThread,
  OpenThreadsClient,
} from "@related/shared";

export interface GroupDetailScreenProps {
  relationship: GroupRelationship;
  groupsClient: GroupsClient;
  openThreadsClient: OpenThreadsClient;
  interactionsClient: InteractionsClient;
  onBack: () => void;
}

const STRAVA_ORANGE = "#FC4C02";
const FONT_REGULAR = "InterTight_400Regular";
const FONT_BOLD = "InterTight_700Bold";
const FONT_BLACK = "InterTight_900Black";

function directionLabel(direction: OpenThread["direction"]): string {
  return direction === "me_owes_them" ? "You owe" : "They owe";
}

function dateLabel(iso: string): string {
  // YYYY-MM-DD is enough for the history strip; the calendar tab is the
  // surface for full date/time formatting.
  return iso.slice(0, 10);
}

export function GroupDetailScreen({
  relationship,
  groupsClient,
  openThreadsClient,
  interactionsClient,
  onBack,
}: GroupDetailScreenProps) {
  const { group } = relationship;
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [threads, setThreads] = useState<OpenThread[]>([]);
  const [history, setHistory] = useState<Interaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      groupsClient.listMembers(group.id),
      openThreadsClient.listOpenForRelationship(relationship.id),
      interactionsClient.listForGroup(group.id),
    ])
      .then(([m, t, h]) => {
        if (cancelled) return;
        setMembers(m);
        setThreads(t);
        setHistory(h);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Could not load this group.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [groupsClient, openThreadsClient, interactionsClient, group.id, relationship.id]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
        <Text style={styles.backLabel}>‹ Back</Text>
      </Pressable>

      <Text style={styles.name}>{group.name}</Text>

      <Text style={styles.sectionHeading}>Members</Text>
      {members.length === 0 ? (
        <Text style={styles.empty}>No members yet</Text>
      ) : (
        members.map((m) => (
          <View key={m.id} style={styles.memberRow}>
            <Text style={styles.memberName}>{m.name}</Text>
          </View>
        ))
      )}

      <Text style={styles.sectionHeading}>Open threads</Text>
      {threads.length === 0 ? (
        <Text style={styles.empty}>No open threads</Text>
      ) : (
        threads.map((t) => (
          <View key={t.id} style={styles.threadRow}>
            <Text style={styles.threadDirection}>
              {directionLabel(t.direction)}
            </Text>
            <Text style={styles.threadDescription}>{t.description}</Text>
          </View>
        ))
      )}

      <Text style={styles.sectionHeading}>Interaction history</Text>
      {history.length === 0 ? (
        <Text style={styles.empty}>No interactions yet</Text>
      ) : (
        history.map((i) => (
          <View key={i.id} style={styles.historyRow}>
            <Text style={styles.historyDate}>{dateLabel(i.time)}</Text>
            <Text style={styles.historyKind}>{i.kind}</Text>
            {i.notes ? (
              <Text style={styles.historyNotes}>{i.notes}</Text>
            ) : null}
          </View>
        ))
      )}

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
  memberRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  memberName: {
    fontSize: 16,
    fontFamily: FONT_REGULAR,
    color: "#000",
  },
  threadRow: {
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
  historyRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  historyDate: {
    fontSize: 10,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#9ca3af",
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  historyKind: {
    fontSize: 14,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#000",
  },
  historyNotes: {
    fontSize: 13,
    fontFamily: FONT_REGULAR,
    color: "#374151",
    marginTop: 2,
  },
  empty: {
    fontSize: 14,
    fontFamily: FONT_REGULAR,
    color: "#9ca3af",
  },
  error: {
    marginTop: 16,
    color: "#dc2626",
    fontSize: 13,
    fontFamily: FONT_REGULAR,
  },
});
