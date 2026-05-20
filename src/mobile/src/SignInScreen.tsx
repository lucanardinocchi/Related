import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { AuthClient, Session } from "@related/shared";

export interface SignInScreenProps {
  authClient: AuthClient;
  onSignedIn: (session: Session) => void;
}

type Mode = "sign-in" | "sign-up";

const STRAVA_ORANGE = "#FC4C02";
const FONT_REGULAR = "InterTight_400Regular";
const FONT_MEDIUM = "InterTight_500Medium";
const FONT_SEMIBOLD = "InterTight_600SemiBold";
const FONT_BOLD = "InterTight_700Bold";
const FONT_BLACK = "InterTight_900Black";

export function SignInScreen({ authClient, onSignedIn }: SignInScreenProps) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const primaryLabel = mode === "sign-in" ? "Sign in" : "Sign up";
  const toggleLabel =
    mode === "sign-in" ? "New here? Sign up" : "Already have an account? Sign in";

  async function handleSubmit() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const session =
        mode === "sign-in"
          ? await authClient.signIn(email, password)
          : await authClient.signUp(email, password);
      onSignedIn(session);
    } catch (err) {
      const message = err instanceof Error ? err.message : `${primaryLabel} failed.`;
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  function toggleMode() {
    setMode(mode === "sign-in" ? "sign-up" : "sign-in");
    setError(null);
  }

  return (
    <View style={styles.root}>
      <Text style={styles.brand}>Related</Text>
      <Text style={styles.heading}>
        {mode === "sign-in" ? "Welcome back" : "Create your account"}
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#9ca3af"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#9ca3af"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <Pressable
        accessibilityRole="button"
        style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <Text style={styles.primaryButtonLabel}>{primaryLabel}</Text>
      </Pressable>

      <Pressable accessibilityRole="button" style={styles.toggle} onPress={toggleMode}>
        <Text style={styles.toggleLabel}>{toggleLabel}</Text>
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
  brand: {
    fontSize: 11,
    fontFamily: FONT_BLACK,
    fontWeight: "900",
    color: STRAVA_ORANGE,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  heading: {
    fontSize: 28,
    fontFamily: FONT_BLACK,
    fontWeight: "900",
    color: "#000",
    letterSpacing: -0.5,
    marginBottom: 32,
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
  primaryButton: {
    backgroundColor: STRAVA_ORANGE,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonLabel: {
    color: "#ffffff",
    fontSize: 16,
    fontFamily: FONT_BLACK,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  toggle: {
    marginTop: 16,
    alignSelf: "center",
  },
  toggleLabel: {
    color: "#6b7280",
    fontSize: 13,
    fontFamily: FONT_SEMIBOLD,
    fontWeight: "600",
  },
  error: {
    marginTop: 16,
    color: "#dc2626",
    fontSize: 14,
    fontFamily: FONT_MEDIUM,
    fontWeight: "500",
  },
});
