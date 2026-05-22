import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type {
  ClosedPerDayBucket,
  Interaction,
  OpenThread,
} from "@related/shared";

export interface HomeProps {
  openThreads: OpenThread[];
  /**
   * Planned Interactions whose `time` is now-or-later, oldest-first. Caller
   * pre-filters and pre-sorts; Home is presentation-only.
   */
  upcomingInteractions: Interaction[];
  /**
   * Daily closed-thread counts for the trailing 60 days, oldest → newest.
   * Home splits this 30/30 to compute the headline total + trend delta and
   * renders the last-30 window as the sparkline.
   */
  closedPerDayLast60: ClosedPerDayBucket[];
  onSignOut: () => void;
  /**
   * Tapping the Talk-to-Claude tile fires this. HomeScreen renders a
   * Relationship picker; the chosen Relationship opens the Chat tab.
   */
  onTalkToClaude?: () => void;
}

function joinContactNames(interaction: Interaction): string {
  return interaction.contacts.map((c) => c.name).join(", ");
}

function formatUpcomingWhen(iso: string): string {
  // "Sat 23 May · 9:00 AM" — short, readable, single-line on a card.
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

const STRAVA_ORANGE = "#FC4C02";
const FONT_REGULAR = "InterTight_400Regular";
const FONT_MEDIUM = "InterTight_500Medium";
const FONT_BOLD = "InterTight_700Bold";
const FONT_BLACK = "InterTight_900Black";

const MINUS = "−";

function sumCounts(buckets: ClosedPerDayBucket[]): number {
  return buckets.reduce((acc, b) => acc + b.count, 0);
}

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta} vs prior 30 days`;
  if (delta < 0) return `${MINUS}${Math.abs(delta)} vs prior 30 days`;
  return `0 vs prior 30 days`;
}

function directionLabel(direction: OpenThread["direction"]): string {
  return direction === "me_owes_them" ? "You owe" : "They owe";
}

function SparklineBar({ count, max }: { count: number; max: number }) {
  const ratio = max === 0 ? 0 : count / max;
  const height = 6 + ratio * 30;
  return (
    <View
      style={{
        flex: 1,
        marginHorizontal: 1,
        height,
        backgroundColor: count === 0 ? "#e5e7eb" : STRAVA_ORANGE,
        borderRadius: 2,
      }}
    />
  );
}

function OpenThreadCard({
  description,
  direction,
}: {
  description: string;
  direction: OpenThread["direction"];
}) {
  return (
    <View style={styles.threadCard}>
      <Text style={styles.threadDirection}>{directionLabel(direction)}</Text>
      <Text style={styles.threadDescription} numberOfLines={3}>
        {description}
      </Text>
    </View>
  );
}

export function Home({
  openThreads,
  upcomingInteractions,
  closedPerDayLast60,
  onSignOut,
  onTalkToClaude,
}: HomeProps) {
  const last30 = closedPerDayLast60.slice(-30);
  const priorEnd = Math.max(closedPerDayLast60.length - 30, 0);
  const prior30 = closedPerDayLast60.slice(0, priorEnd);
  const total = sumCounts(last30);
  const prior = sumCounts(prior30);
  const delta = total - prior;
  const sparklineMax = last30.reduce((acc, b) => Math.max(acc, b.count), 0);

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
        <Text style={styles.trend}>{formatDelta(delta)}</Text>
        <View style={styles.sparklineRow} testID="sparkline-bars">
          {last30.map((b, i) => (
            <SparklineBar key={i} count={b.count} max={sparklineMax} />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>Open threads</Text>
          <Text style={styles.sectionMeta}>{openThreads.length} owed</Text>
        </View>
        {openThreads.length === 0 ? (
          <Text style={styles.emptyState}>No open threads</Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            testID="open-threads-carousel"
            contentContainerStyle={styles.carouselContent}
          >
            {openThreads.map((t) => (
              <OpenThreadCard
                key={t.id}
                description={t.description}
                direction={t.direction}
              />
            ))}
          </ScrollView>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        style={styles.cta}
        onPress={onTalkToClaude}
      >
        <Text style={styles.ctaPrimary}>Talk to Claude</Text>
        <Text style={styles.ctaSecondary}>Voice · always on</Text>
      </Pressable>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Upcoming</Text>
        {upcomingInteractions.length === 0 ? (
          <Text style={styles.emptyState}>Nothing coming up</Text>
        ) : (
          upcomingInteractions.map((i) => (
            <View key={i.id} style={styles.upcomingRow}>
              <Text style={styles.upcomingKind}>{i.kind}</Text>
              <Text style={styles.upcomingPeople}>{joinContactNames(i)}</Text>
              <Text style={styles.upcomingWhen}>{formatUpcomingWhen(i.time)}</Text>
            </View>
          ))
        )}
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
  trend: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 0.4,
  },
  sparklineRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    height: 40,
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
  carouselContent: {
    paddingRight: 12,
  },
  threadCard: {
    width: 200,
    marginRight: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    backgroundColor: "#ffffff",
  },
  threadDirection: {
    fontSize: 10,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: STRAVA_ORANGE,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  threadDescription: {
    fontSize: 14,
    fontFamily: FONT_REGULAR,
    color: "#111",
    lineHeight: 18,
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
  upcomingRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  upcomingKind: {
    fontSize: 11,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: STRAVA_ORANGE,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  upcomingPeople: {
    fontSize: 15,
    fontFamily: FONT_MEDIUM,
    fontWeight: "500",
    color: "#000",
  },
  upcomingWhen: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: FONT_REGULAR,
    color: "#6b7280",
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
