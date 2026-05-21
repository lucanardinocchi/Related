import { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { AuthClient, OAuthSignInProvider, Session } from "@related/shared";
import { colors, fonts, fontSizes, lineHeights, radii } from "./ui/tokens";

export interface SignInScreenProps {
  authClient: AuthClient;
  onSignedIn: (session: Session) => void;
  /** Where Supabase sends the User after clicking the reset link in email. */
  passwordResetRedirectTo: string;
  /** Opens provider OAuth (native: in-app browser; web: full redirect). */
  onOAuthSignIn: (provider: OAuthSignInProvider) => Promise<void>;
}

type Mode = "sign-in" | "sign-up" | "forgot-password";

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

  const heading =
    mode === "sign-in"
      ? "Sign in"
      : mode === "sign-up"
        ? "Create your account"
        : "Reset password";

  const subtitle =
    mode === "sign-in"
      ? "Welcome back to Related."
      : mode === "sign-up"
        ? "Start building your relationship context."
        : "We'll email you a link to choose a new password.";

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
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.root}>
        <Text style={styles.heading}>{heading}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {resetEmailSent ? (
          <Text style={styles.success}>
            Check your email for a link to set a new password. Open the link in
            your browser to continue.
          </Text>
        ) : (
          <View style={styles.card}>
            {mode !== "forgot-password" ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  style={[
                    styles.oauthButton,
                    oauthLoading === "google" && styles.oauthButtonDisabled,
                  ]}
                  onPress={() => void handleOAuth("google")}
                  disabled={submitting || oauthLoading !== null}
                >
                  <Text style={styles.oauthButtonLabel}>
                    Continue with Google
                  </Text>
                </Pressable>
                {showAppleSignIn ? (
                  <Pressable
                    accessibilityRole="button"
                    style={[
                      styles.oauthButton,
                      oauthLoading === "apple" && styles.oauthButtonDisabled,
                    ]}
                    onPress={() => void handleOAuth("apple")}
                    disabled={submitting || oauthLoading !== null}
                  >
                    <Text style={styles.oauthButtonLabel}>
                      Continue with Apple
                    </Text>
                  </Pressable>
                ) : null}
                <Text style={styles.divider}>or continue with email</Text>
              </>
            ) : null}

            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.fgSubtle}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />

            {mode !== "forgot-password" ? (
              <>
                <Text style={styles.fieldLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor={colors.fgSubtle}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
              </>
            ) : null}

            {mode === "sign-in" ? (
              <Pressable
                accessibilityRole="button"
                style={styles.forgotLink}
                onPress={() => setAuthMode("forgot-password")}
              >
                <Text style={styles.forgotLinkLabel}>Forgot password?</Text>
              </Pressable>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={primaryLabel}
              style={[
                styles.primaryButton,
                submitting && styles.primaryButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              <Text style={styles.primaryButtonLabel}>{primaryLabel}</Text>
            </Pressable>
          </View>
        )}

        {mode === "forgot-password" ? (
          <Pressable
            accessibilityRole="button"
            style={styles.footerLink}
            onPress={() => setAuthMode("sign-in")}
          >
            <Text style={styles.footerText}>
              Back to{" "}
              <Text style={styles.footerAction}>sign in</Text>
            </Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            style={styles.footerLink}
            onPress={() =>
              setAuthMode(mode === "sign-in" ? "sign-up" : "sign-in")
            }
          >
            <Text style={styles.footerText}>
              {mode === "sign-in" ? "New here? " : "Already have an account? "}
              <Text style={styles.footerAction}>
                {mode === "sign-in" ? "Create an account" : "Sign in"}
              </Text>
            </Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    backgroundColor: colors.bg,
  },
  root: {
    flex: 1,
    maxWidth: 448,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
    justifyContent: "center",
  },
  heading: {
    fontSize: fontSizes.h1,
    lineHeight: lineHeights.h1,
    fontFamily: fonts.sansBold,
    color: colors.fg,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: fontSizes.small,
    lineHeight: lineHeights.small,
    fontFamily: fonts.sans,
    color: colors.fgMuted,
    marginBottom: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 16,
    gap: 12,
  },
  fieldLabel: {
    fontSize: fontSizes.small,
    lineHeight: lineHeights.small,
    fontFamily: fonts.sansMedium,
    color: colors.fg,
    marginBottom: -4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fontSizes.body,
    fontFamily: fonts.sans,
    color: colors.fg,
    backgroundColor: colors.bg,
  },
  primaryButton: {
    backgroundColor: colors.fg,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonLabel: {
    color: colors.fgOnAccent,
    fontSize: fontSizes.body,
    fontFamily: fonts.sansMedium,
  },
  forgotLink: {
    alignSelf: "flex-end",
    marginTop: -4,
  },
  forgotLinkLabel: {
    color: colors.fgMuted,
    fontSize: fontSizes.small,
    fontFamily: fonts.sans,
    textDecorationLine: "underline",
  },
  footerLink: {
    marginTop: 24,
    alignSelf: "center",
  },
  footerText: {
    color: colors.fgMuted,
    fontSize: fontSizes.small,
    fontFamily: fonts.sans,
    textAlign: "center",
  },
  footerAction: {
    color: colors.fg,
    textDecorationLine: "underline",
  },
  error: {
    color: colors.danger,
    fontSize: fontSizes.small,
    fontFamily: fonts.sans,
  },
  success: {
    color: colors.fg,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontFamily: fonts.sans,
  },
  oauthButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  oauthButtonDisabled: {
    opacity: 0.5,
  },
  oauthButtonLabel: {
    fontSize: fontSizes.body,
    fontFamily: fonts.sansMedium,
    color: colors.fg,
  },
  divider: {
    textAlign: "center",
    color: colors.fgSubtle,
    fontSize: fontSizes.micro,
    fontFamily: fonts.sans,
    marginVertical: 4,
  },
});
