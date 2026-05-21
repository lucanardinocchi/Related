import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { AuthClient, OAuthSignInProvider, Session } from "@related/shared";

export interface SignInScreenProps {
  authClient: AuthClient;
  onSignedIn: (session: Session) => void;
  /** Where Supabase sends the User after clicking the reset link in email. */
  passwordResetRedirectTo: string;
  /** Opens provider OAuth (native: in-app browser; web: full redirect). */
  onOAuthSignIn: (provider: OAuthSignInProvider) => Promise<void>;
}

type Mode = "sign-in" | "sign-up" | "forgot-password";

const STRAVA_ORANGE = "#FC4C02";
const FONT_REGULAR = "InterTight_400Regular";
const FONT_MEDIUM = "InterTight_500Medium";
const FONT_SEMIBOLD = "InterTight_600SemiBold";
const FONT_BOLD = "InterTight_700Bold";
const FONT_BLACK = "InterTight_900Black";

const showAppleSignIn =
  Platform.OS === "ios" ||
  (Platform.OS === "web" && typeof navigator !== "undefined");

export function SignInScreen({
  authClient,
  onSignedIn,
  passwordResetRedirectTo,
  onOAuthSignIn,
}: SignInScreenProps) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthSignInProvider | null>(
    null,
  );
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const primaryLabel =
    mode === "sign-in"
      ? "Sign in"
      : mode === "sign-up"
        ? "Sign up"
        : "Send reset link";

  async function handleSubmit() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "forgot-password") {
        await authClient.requestPasswordReset(email, passwordResetRedirectTo);
        setResetEmailSent(true);
        return;
      }
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

  function setAuthMode(next: Mode) {
    setMode(next);
    setError(null);
    setResetEmailSent(false);
  }

  async function handleOAuth(provider: OAuthSignInProvider) {
    if (submitting || oauthLoading) return;
    setError(null);
    setOauthLoading(provider);
    try {
      await onOAuthSignIn(provider);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "OAuth sign-in failed.";
      setError(message);
    } finally {
      setOauthLoading(null);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.brand}>Related</Text>
      <Text style={styles.heading}>
        {mode === "sign-in"
          ? "Welcome back"
          : mode === "sign-up"
            ? "Create your account"
            : "Reset password"}
      </Text>

      {resetEmailSent ? (
        <Text style={styles.success}>
          Check your email for a link to set a new password. Open the link in
          your browser to continue.
        </Text>
      ) : mode !== "forgot-password" ? (
        <>
          <Pressable
            accessibilityRole="button"
            style={[styles.oauthButton, oauthLoading === "google" && styles.oauthButtonDisabled]}
            onPress={() => void handleOAuth("google")}
            disabled={submitting || oauthLoading !== null}
          >
            <Text style={styles.oauthButtonLabel}>Continue with Google</Text>
          </Pressable>
          {showAppleSignIn ? (
            <Pressable
              accessibilityRole="button"
              style={[styles.oauthButton, oauthLoading === "apple" && styles.oauthButtonDisabled]}
              onPress={() => void handleOAuth("apple")}
              disabled={submitting || oauthLoading !== null}
            >
              <Text style={styles.oauthButtonLabel}>Continue with Apple</Text>
            </Pressable>
          ) : null}
          <Text style={styles.divider}>or continue with email</Text>
        </>
      ) : null}

      {resetEmailSent ? null : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          {mode !== "forgot-password" ? (
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          ) : null}

          <Pressable
            accessibilityRole="button"
            style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text style={styles.primaryButtonLabel}>{primaryLabel}</Text>
          </Pressable>
        </>
      )}

      {mode === "sign-in" ? (
        <Pressable
          accessibilityRole="button"
          style={styles.toggle}
          onPress={() => setAuthMode("forgot-password")}
        >
          <Text style={styles.toggleLabel}>Forgot password?</Text>
        </Pressable>
      ) : null}

      {mode === "forgot-password" ? (
        <Pressable
          accessibilityRole="button"
          style={styles.toggle}
          onPress={() => setAuthMode("sign-in")}
        >
          <Text style={styles.toggleLabel}>Back to sign in</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          style={styles.toggle}
          onPress={() =>
            setAuthMode(mode === "sign-in" ? "sign-up" : "sign-in")
          }
        >
          <Text style={styles.toggleLabel}>
            {mode === "sign-in"
              ? "New here? Sign up"
              : "Already have an account? Sign in"}
          </Text>
        </Pressable>
      )}

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
  success: {
    color: "#374151",
    fontSize: 15,
    fontFamily: FONT_REGULAR,
    lineHeight: 22,
  },
  oauthButton: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  oauthButtonDisabled: {
    opacity: 0.6,
  },
  oauthButtonLabel: {
    fontSize: 15,
    fontFamily: FONT_SEMIBOLD,
    fontWeight: "600",
    color: "#000",
  },
  divider: {
    textAlign: "center",
    color: "#9ca3af",
    fontSize: 12,
    fontFamily: FONT_REGULAR,
    marginBottom: 16,
    marginTop: 4,
  },
});
