import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { GroupRelationship, GroupsClient } from "@related/shared";

export interface GroupsListScreenProps {
  groupsClient: GroupsClient;
  onSelect: (relationship: GroupRelationship) => void;
  onCreateGroup: () => void;
}

const STRAVA_ORANGE = "#FC4C02";
const FONT_REGULAR = "InterTight_400Regular";
const FONT_BOLD = "InterTight_700Bold";
const FONT_BLACK = "InterTight_900Black";

export function GroupsListScreen({
  groupsClient,
  onSelect,
  onCreateGroup,
}: GroupsListScreenProps) {
  const [groups, setGroups] = useState<GroupRelationship[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    groupsClient
      .listGroupRelationships()
      .then((rs) => {
        if (cancelled) return;
        setGroups(rs);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load groups.");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [groupsClient]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.heading}>Groups</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onCreateGroup}
          style={styles.addButton}
        >
          <Text style={styles.addLabel}>+ New group</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loaded && groups.length === 0 && !error ? (
        <Text style={styles.empty}>No groups yet</Text>
      ) : null}

      <FlatList
        data={groups}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            style={styles.row}
            onPress={() => onSelect(item)}
          >
            <Text style={styles.rowName}>{item.group.name}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingTop: 64,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  heading: {
    fontSize: 24,
    fontFamily: FONT_BLACK,
    fontWeight: "900",
    color: "#000",
    letterSpacing: -0.5,
  },
  addButton: {
    backgroundColor: STRAVA_ORANGE,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addLabel: {
    color: "#ffffff",
    fontSize: 12,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  row: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  rowName: {
    fontSize: 16,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#000",
  },
  empty: {
    color: "#9ca3af",
    fontSize: 14,
    fontFamily: FONT_REGULAR,
    marginTop: 12,
  },
  error: {
    color: "#dc2626",
    fontSize: 14,
    fontFamily: FONT_REGULAR,
    marginTop: 12,
  },
});
