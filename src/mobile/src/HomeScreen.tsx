import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type {
  ClosedPerDayBucket,
  Interaction,
  InteractionsClient,
  OpenThread,
  OpenThreadsClient,
  Relationship,
  RelationshipsClient,
} from "@related/shared";
import { Home } from "./Home";

export interface HomeScreenProps {
  openThreadsClient: OpenThreadsClient;
  interactionsClient: InteractionsClient;
  /**
   * Source for the Home tile's Relationship picker. Loaded lazily on first
   * picker open (and on every open, so the list stays fresh).
   */
  relationshipsClient: RelationshipsClient;
  /**
   * Fired when the User picks a Relationship from the Talk-to-Claude tile's
   * picker. AuthedApp wires this to cross-tab navigate into the Agent screen.
   */
  onTalkToClaude: (relationship: Relationship) => void;
  onSignOut: () => void;
}

const FONT_REGULAR = "InterTight_400Regular";
const FONT_BOLD = "InterTight_700Bold";
const FONT_BLACK = "InterTight_900Black";

/** Format a Date as YYYY-MM-DD in UTC. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Build the 60-day inclusive UTC window ending today. The Home graph card
 * splits this 30/30 for total + prior delta.
 */
function buildClosedPerDayWindow(): { from: string; to: string } {
  const today = new Date(Date.now());
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 59);
  return { from: isoDate(from), to: isoDate(today) };
}

export function HomeScreen({
  openThreadsClient,
  interactionsClient,
  relationshipsClient,
  onTalkToClaude,
  onSignOut,
}: HomeScreenProps) {
  const [openThreads, setOpenThreads] = useState<OpenThread[]>([]);
  const [closedPerDay, setClosedPerDay] = useState<ClosedPerDayBucket[]>([]);
  const [upcoming, setUpcoming] = useState<Interaction[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRelationships, setPickerRelationships] = useState<Relationship[]>(
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const window = buildClosedPerDayWindow();
    // Loads are independent — if one fails we still show whatever did load.
    // Failures are silent in the UI (Home renders empty states); the user
    // can retry by re-navigating to the tab.
    openThreadsClient
      .listOpenForUser()
      .then((threads) => {
        if (!cancelled) setOpenThreads(threads);
      })
      .catch(() => {});
    openThreadsClient
      .closedPerDay(window)
      .then((buckets) => {
        if (!cancelled) setClosedPerDay(buckets);
      })
      .catch(() => {});
    interactionsClient
      .listUpcomingPlanned()
      .then((next) => {
        if (!cancelled) setUpcoming(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [openThreadsClient, interactionsClient]);

  async function openPicker() {
    setPickerOpen(true);
    try {
      const list = await relationshipsClient.listRelationships();
      setPickerRelationships(list);
    } catch {
      // Empty list ⇒ picker shows an empty state. The user can dismiss and
      // retry via the Relationships tab.
    }
  }

  function pickRelationship(relationship: Relationship) {
    setPickerOpen(false);
    onTalkToClaude(relationship);
  }

  return (
    <>
      <Home
        openThreads={openThreads}
        upcomingInteractions={upcoming}
        closedPerDayLast60={closedPerDay}
        onSignOut={onSignOut}
        onTalkToClaude={openPicker}
      />
      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.pickerRoot}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Who about?</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPickerOpen(false)}
            >
              <Text style={styles.pickerClose}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.pickerList}>
            {pickerRelationships.length === 0 ? (
              <Text style={styles.pickerEmpty}>
                No Relationships yet. Add a Contact first.
              </Text>
            ) : (
              pickerRelationships.map((r) => (
                <Pressable
                  key={r.id}
                  accessibilityRole="button"
                  onPress={() => pickRelationship(r)}
                  style={styles.pickerRow}
                >
                  <Text style={styles.pickerName}>{r.contact.name}</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pickerRoot: { flex: 1, backgroundColor: "#ffffff", paddingTop: 56 },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  pickerTitle: {
    fontSize: 28,
    fontFamily: FONT_BLACK,
    fontWeight: "900",
    color: "#000",
    letterSpacing: -0.5,
  },
  pickerClose: {
    fontSize: 12,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  pickerList: { paddingHorizontal: 20, paddingBottom: 40 },
  pickerEmpty: {
    fontSize: 14,
    color: "#9ca3af",
    fontFamily: FONT_REGULAR,
    marginTop: 12,
  },
  pickerRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  pickerName: {
    fontSize: 17,
    fontFamily: FONT_REGULAR,
    color: "#111827",
  },
});
