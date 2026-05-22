import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { OAuthSignInProvider } from "@related/shared";
import { AppleIcon, GoogleIcon } from "./providerIcons";

export type ProviderAuthAction = "sign-in" | "sign-up";

export interface ProviderSignInButtonProps {
  provider: OAuthSignInProvider;
  action?: ProviderAuthAction;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

function providerLabel(
  provider: OAuthSignInProvider,
  action: ProviderAuthAction,
): string {
  const verb = action === "sign-up" ? "Sign up" : "Sign in";
  return provider === "google"
    ? `${verb} with Google`
    : `${verb} with Apple`;
}

const providerStyles: Record<
  OAuthSignInProvider,
  {
    buttonStyle: ViewStyle;
    labelStyle: { color: string };
    spinnerColor: string;
  }
> = {
  google: {
    buttonStyle: {
      backgroundColor: "#FFFFFF",
      borderColor: "#747775",
    },
    labelStyle: { color: "#1F1F1F" },
    spinnerColor: "#1F1F1F",
  },
  apple: {
    buttonStyle: {
      backgroundColor: "#000000",
      borderColor: "#000000",
    },
    labelStyle: { color: "#FFFFFF" },
    spinnerColor: "#FFFFFF",
  },
};

export function ProviderSignInButton({
  provider,
  action = "sign-in",
  onPress,
  disabled = false,
  loading = false,
  style,
}: ProviderSignInButtonProps) {
  const label = providerLabel(provider, action);
  const config = providerStyles[provider];
  const Icon = provider === "google" ? GoogleIcon : AppleIcon;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        config.buttonStyle,
        pressed && !disabled && !loading && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={config.spinnerColor} />
      ) : (
        <Icon />
      )}
      <Text style={[styles.label, config.labelStyle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 8,
  },
  pressed: {
    opacity: 0.92,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
  },
});
