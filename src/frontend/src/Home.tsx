import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export interface OpenThread {
  id: string;
  description: string;
  age: string;
}

export interface UpcomingEvent {
  id: string;
  title: string;
  when: string;
  time: string;
}

export interface HomeProps {
  openThreads: OpenThread[];
  upcomingEvents: UpcomingEvent[];
  /** Daily count of Threads closed for the last 30 days (oldest → newest). */
  threadsClosedLast30Days: number[];
  onSignOut: () => void;
}

const STRAVA_ORANGE = "#FC4C02";
const FONT_REGULAR = "InterTight_400Regular";
const FONT_MEDIUM = "InterTight_500Medium";
const FONT_BOLD = "InterTight_700Bold";
const FONT_BLACK = "InterTight_900Black";

export function Home({
  openThreads,
  upcomingEvents,
  threadsClosedLast30Days,
  onSignOut,
}: HomeProps) {
  const total = threadsClosedLast30Days.reduce((a, b) => a + b, 0);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.timestamp}>Today</Text>
        <Text style={styles.greeting}>Good to see you</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.sectionLabel}>Threads closed</Text>
          <Text style={styles.sectionMeta}>Last 30 days</Text>
        </View>
        <Text style={styles.bigNumber}>{total}</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>Open threads</Text>
          <Text style={styles.sectionMeta}>{openThreads.length} owed</Text>
        </View>
        {openThreads.length === 0 ? (
          <Text style={styles.emptyState}>No open threads</Text>
        ) : null}
      </View>

      <Pressable accessibilityRole="button" style={styles.cta}>
        <Text style={styles.ctaPrimary}>Talk to Claude</Text>
        <Text style={styles.ctaSecondary}>Voice · always on</Text>
      </Pressable>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Upcoming</Text>
        {upcomingEvents.length === 0 ? (
          <Text style={styles.emptyState}>Nothing coming up</Text>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        style={styles.signOut}
        onPress={onSignOut}
      >
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 48,
  },
  header: {
    marginBottom: 20,
  },
  timestamp: {
    fontSize: 11,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  greeting: {
    fontSize: 30,
    fontFamily: FONT_BLACK,
    fontWeight: "900",
    color: "#000",
    marginTop: 4,
    letterSpacing: -0.5,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    marginBottom: 24,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  sectionMeta: {
    fontSize: 10,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#9ca3af",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  bigNumber: {
    fontSize: 44,
    fontFamily: FONT_BLACK,
    fontWeight: "900",
    color: "#000",
    letterSpacing: -1.5,
    lineHeight: 48,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 12,
  },
  emptyState: {
    fontSize: 14,
    fontFamily: FONT_MEDIUM,
    fontWeight: "500",
    color: "#9ca3af",
  },
  cta: {
    backgroundColor: STRAVA_ORANGE,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  ctaPrimary: {
    fontSize: 17,
    fontFamily: FONT_BLACK,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: -0.4,
  },
  ctaSecondary: {
    fontSize: 10,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "rgba(255,255,255,0.9)",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginTop: 4,
  },
  signOut: {
    marginTop: 16,
    alignSelf: "flex-start",
  },
  signOutLabel: {
    fontSize: 12,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
