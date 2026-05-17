import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Contact, RelationshipsClient } from "@related/shared";

export interface AddContactScreenProps {
  relationshipsClient: RelationshipsClient;
  onCreated: (contact: Contact) => void;
  onCancel: () => void;
}

const STRAVA_ORANGE = "#FC4C02";
const FONT_REGULAR = "InterTight_400Regular";
const FONT_BOLD = "InterTight_700Bold";
const FONT_BLACK = "InterTight_900Black";

export function AddContactScreen({
  relationshipsClient,
  onCreated,
  onCancel,
}: AddContactScreenProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    if (submitting) return;
    if (!name.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const contact = await relationshipsClient.createContact({
        name,
        phone: phone || null,
        email: email || null,
      });
      onCreated(contact);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save contact.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>New contact</Text>
      <TextInput
        style={styles.input}
        placeholder="Name"
        placeholderTextColor="#9ca3af"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Phone (optional)"
        placeholderTextColor="#9ca3af"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      <TextInput
        style={styles.input}
        placeholder="Email (optional)"
        placeholderTextColor="#9ca3af"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <Pressable
        accessibilityRole="button"
        style={[styles.primary, submitting && styles.primaryDisabled]}
        onPress={handleSave}
        disabled={submitting}
      >
        <Text style={styles.primaryLabel}>Save</Text>
      </Pressable>
      <Pressable accessibilityRole="button" style={styles.cancel} onPress={onCancel}>
        <Text style={styles.cancelLabel}>Cancel</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 24,
    paddingTop: 96,
  },
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
  primary: {
    backgroundColor: STRAVA_ORANGE,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
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
