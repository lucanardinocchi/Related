import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Relationship } from "@related/shared";

export interface RelationshipDetailScreenProps {
  relationship: Relationship;
  onBack: () => void;
}

const FONT_REGULAR = "InterTight_400Regular";
const FONT_BOLD = "InterTight_700Bold";
const FONT_BLACK = "InterTight_900Black";

export function RelationshipDetailScreen({
  relationship,
  onBack,
}: RelationshipDetailScreenProps) {
  const { contact } = relationship;
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
});
