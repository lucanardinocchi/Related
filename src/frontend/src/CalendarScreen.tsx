import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { Interaction, InteractionsClient } from "@related/shared";

export interface CalendarScreenProps {
  interactionsClient: InteractionsClient;
}

const STRAVA_ORANGE = "#FC4C02";
const FONT_REGULAR = "InterTight_400Regular";
const FONT_MEDIUM = "InterTight_500Medium";
const FONT_BOLD = "InterTight_700Bold";
const FONT_BLACK = "InterTight_900Black";

function utcDate(iso: string): string {
  return iso.slice(0, 10);
}

interface DateGroup {
  date: string;
  items: Interaction[];
}

/**
 * Group Interactions by UTC date, preserving caller-supplied order within
 * each day. Calendar contract: "all planned Interactions grouped by date"
 * (issue scope widened to "all statuses" per current product intent).
 */
function groupByDate(interactions: Interaction[]): DateGroup[] {
  const groups: DateGroup[] = [];
  for (const i of interactions) {
    const date = utcDate(i.time);
    const last = groups[groups.length - 1];
    if (last && last.date === date) {
      last.items.push(i);
    } else {
      groups.push({ date, items: [i] });
    }
  }
  return groups;
}

function statusLabel(status: Interaction["status"]): string {
  return status.toUpperCase();
}

function joinContactNames(i: Interaction): string {
  return i.contacts.map((c) => c.name).join(", ");
}

export function CalendarScreen({ interactionsClient }: CalendarScreenProps) {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    interactionsClient
      .listAll()
      .then((next) => {
        if (cancelled) return;
        setInteractions(next);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [interactionsClient]);

  const groups = groupByDate(interactions);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.timestamp}>Calendar</Text>
        <Text style={styles.heading}>Coming up</Text>
      </View>

      {loaded && groups.length === 0 ? (
        <Text style={styles.empty}>Nothing on the calendar</Text>
      ) : null}

      {groups.map((g) => (
        <View key={g.date} style={styles.dayBlock}>
          <Text style={styles.dayHeader}>{g.date}</Text>
          {g.items.map((i) => (
            <View key={i.id} style={styles.row}>
              <View style={styles.rowHeaderRow}>
                <Text style={styles.kind}>{i.kind}</Text>
                <Text style={styles.status}>{statusLabel(i.status)}</Text>
              </View>
              <Text style={styles.people}>{joinContactNames(i)}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ffffff" },
  content: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 48 },
  header: { marginBottom: 20 },
  timestamp: {
    fontSize: 11,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  heading: {
    fontSize: 30,
    fontFamily: FONT_BLACK,
    fontWeight: "900",
    color: "#000",
    marginTop: 4,
    letterSpacing: -0.5,
  },
  empty: {
    fontSize: 14,
    fontFamily: FONT_REGULAR,
    color: "#9ca3af",
  },
  dayBlock: { marginBottom: 20 },
  dayHeader: {
    fontSize: 11,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  row: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  rowHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  kind: {
    fontSize: 11,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: STRAVA_ORANGE,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  status: {
    fontSize: 10,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#9ca3af",
    letterSpacing: 1.2,
  },
  people: {
    marginTop: 2,
    fontSize: 15,
    fontFamily: FONT_MEDIUM,
    fontWeight: "500",
    color: "#000",
  },
});
