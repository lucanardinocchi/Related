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
  Goal,
  SituationalState,
  UserContextClient,
} from "@related/shared";

export interface YouScreenProps {
  userContextClient: UserContextClient;
}

const STRAVA_ORANGE = "#FC4C02";
const FONT_REGULAR = "InterTight_400Regular";
const FONT_BOLD = "InterTight_700Bold";
const FONT_BLACK = "InterTight_900Black";

export function YouScreen({ userContextClient }: YouScreenProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [situational, setSituational] = useState<SituationalState | null>(null);
  const [situationalDraft, setSituationalDraft] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      userContextClient.listGoals(),
      userContextClient.getSituationalState(),
    ])
      .then(([g, s]) => {
        if (cancelled) return;
        setGoals(g);
        setSituational(s);
        setSituationalDraft(s?.content ?? "");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load user context.");
      });
    return () => {
      cancelled = true;
    };
  }, [userContextClient]);

  async function handleAddGoal() {
    if (!newGoal.trim()) return;
    try {
      const g = await userContextClient.addGoal(newGoal.trim());
      setGoals((curr) => [g, ...curr]);
      setNewGoal("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save goal.");
    }
  }

  async function handleDeleteGoal(id: string) {
    try {
      await userContextClient.deleteGoal(id);
      setGoals((curr) => curr.filter((g) => g.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete goal.");
    }
  }

  async function handleSaveSituational() {
    try {
      const next = await userContextClient.setSituationalState(situationalDraft);
      setSituational(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save Situational State.");
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>You</Text>

      <Text style={styles.sectionLabel}>Goals & values</Text>
      <Text style={styles.sectionHint}>
        Long-running statements the agent reasons over. Only you write these —
        the agent never invents them.
      </Text>
      {goals.length === 0 ? (
        <Text style={styles.empty}>No goals yet</Text>
      ) : (
        goals.map((g) => (
          <View key={g.id} style={styles.goalRow}>
            <Text style={styles.goalContent}>{g.content}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => handleDeleteGoal(g.id)}
              style={styles.deleteBtn}
            >
              <Text style={styles.deleteLabel}>Delete</Text>
            </Pressable>
          </View>
        ))
      )}

      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="Add a goal or value…"
          placeholderTextColor="#9ca3af"
          value={newGoal}
          onChangeText={setNewGoal}
        />
        <Pressable
          accessibilityRole="button"
          onPress={handleAddGoal}
          style={styles.primary}
        >
          <Text style={styles.primaryLabel}>Add</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>Situational state</Text>
      <Text style={styles.sectionHint}>
        Where you are in life right now. The agent may quietly update this
        when you mention a life change in conversation.
      </Text>
      <TextInput
        style={[styles.input, styles.narrative]}
        placeholder="What's going on in your life right now?"
        placeholderTextColor="#9ca3af"
        multiline
        value={situationalDraft}
        onChangeText={setSituationalDraft}
      />
      <Pressable
        accessibilityRole="button"
        onPress={handleSaveSituational}
        style={styles.primary}
      >
        <Text style={styles.primaryLabel}>Save situational state</Text>
      </Pressable>

      {situational?.updatedAt ? (
        <Text style={styles.meta}>Last updated {situational.updatedAt}</Text>
      ) : null}

      <Text style={styles.sectionLabel}>Inferred signals</Text>
      <Text style={styles.sectionHint}>
        Sleep signal: iOS only in v1. The agent reads sleep via HealthKit;
        Android and web Users won't see this signal influence Passes yet.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ffffff" },
  content: { paddingHorizontal: 20, paddingTop: 64, paddingBottom: 48 },
  heading: {
    fontSize: 28,
    fontFamily: FONT_BLACK,
    fontWeight: "900",
    color: "#000",
    letterSpacing: -0.5,
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 24,
    marginBottom: 6,
  },
  sectionHint: {
    fontSize: 13,
    fontFamily: FONT_REGULAR,
    color: "#9ca3af",
    marginBottom: 12,
  },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  goalContent: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONT_REGULAR,
    color: "#000",
  },
  deleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
  },
  deleteLabel: {
    fontSize: 11,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#374151",
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: FONT_REGULAR,
    color: "#000",
  },
  narrative: {
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  primary: {
    backgroundColor: STRAVA_ORANGE,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  primaryLabel: {
    color: "#ffffff",
    fontSize: 14,
    fontFamily: FONT_BLACK,
    fontWeight: "900",
  },
  empty: {
    fontSize: 14,
    fontFamily: FONT_REGULAR,
    color: "#9ca3af",
    marginBottom: 8,
  },
  meta: {
    marginTop: 8,
    fontSize: 11,
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
