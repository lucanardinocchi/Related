import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  OnboardingClient,
  type OnboardingState,
  type OnboardingStep,
} from "@related/shared";

export interface OnboardingScreenProps {
  onboardingClient: OnboardingClient;
  onFinished: () => void;
}

const STRAVA_ORANGE = "#FC4C02";
const FONT_REGULAR = "InterTight_400Regular";
const FONT_BOLD = "InterTight_700Bold";
const FONT_BLACK = "InterTight_900Black";

interface StepContent {
  title: string;
  body: string;
  ctaPrimary: string;
  ctaSkip?: string;
  /** Inline note shown when the step's infra isn't wired in this build. */
  deferredNote?: string;
}

const STEP_CONTENT: Record<OnboardingStep, StepContent> = {
  welcome: {
    title: "Welcome to Related",
    body:
      "Related is an ambient agent that quietly reasons about the people you care about so you can stay close without keeping a mental ledger. The next few screens set it up.",
    ctaPrimary: "Continue",
  },
  calendar: {
    title: "Calendar permission",
    body:
      "Connect your calendar so Related can read your week's density. It uses it to gauge when you have capacity for catch-ups. Reads only; never writes.",
    ctaPrimary: "Connect calendar",
    ctaSkip: "Skip",
    deferredNote:
      "Calendar OAuth lands with the Google Cloud credentials. Skip for now — the agent reads `calendar: unavailable` and proceeds.",
  },
  healthkit: {
    title: "HealthKit (iOS)",
    body:
      "Optional: let Related read your recent sleep from HealthKit. It uses it to flag low-energy windows so suggested plans match your capacity. Reads only.",
    ctaPrimary: "Connect HealthKit",
    ctaSkip: "Skip",
    deferredNote:
      "HealthKit is iOS-only and ships with the native build. Skip for now.",
  },
  notifications: {
    title: "Notifications",
    body:
      "Let Related notify you when something needs attention. Quiet hours respected. You can change this in You / settings any time.",
    ctaPrimary: "Allow",
    ctaSkip: "Skip",
    deferredNote:
      "Push provider credentials (Expo / VAPID / APNs) land with the native build. Skip for now.",
  },
  contacts: {
    title: "First Contacts",
    body:
      "Add 3-5 of the people you most want to stay close to. You can add more any time from the Relationships tab.",
    ctaPrimary: "Add contacts",
    ctaSkip: "Skip — I'll add them later",
  },
  goals: {
    title: "Goals & Values",
    body:
      "Optional: write a sentence or two on how you want to show up for the people in your life. The agent reads these on every Pass.",
    ctaPrimary: "Add a goal",
    ctaSkip: "Skip",
  },
  done: {
    title: "All set.",
    body:
      "Related is now running quietly in the background. Tap Talk to Claude to start your first voice session.",
    ctaPrimary: "Talk to Claude",
  },
};

export function OnboardingScreen({
  onboardingClient,
  onFinished,
}: OnboardingScreenProps) {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    onboardingClient.startIfNeeded().then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, [onboardingClient]);

  if (!state) return null;

  const currentStep = OnboardingClient.nextStep(state);
  if (!currentStep) {
    // Onboarding already finished — bounce out.
    onFinished();
    return null;
  }

  const content = STEP_CONTENT[currentStep];

  async function advance() {
    if (!state || working) return;
    setWorking(true);
    try {
      const next = await onboardingClient.completeStep(currentStep!);
      setState(next);
      if (next.isFinished) {
        onFinished();
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.stepNumber}>
        Step {state.completedSteps.length + 1} of 7
      </Text>
      <Text style={styles.title}>{content.title}</Text>
      <Text style={styles.body}>{content.body}</Text>

      {content.deferredNote ? (
        <Text style={styles.deferredNote}>{content.deferredNote}</Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={advance}
        disabled={working}
        style={[styles.primary, working && styles.primaryDisabled]}
      >
        <Text style={styles.primaryLabel}>{content.ctaPrimary}</Text>
      </Pressable>

      {content.ctaSkip ? (
        <Pressable
          accessibilityRole="button"
          onPress={advance}
          disabled={working}
          style={styles.secondary}
        >
          <Text style={styles.secondaryLabel}>{content.ctaSkip}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ffffff" },
  content: { paddingHorizontal: 24, paddingTop: 96, paddingBottom: 48 },
  stepNumber: {
    fontSize: 11,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontFamily: FONT_BLACK,
    fontWeight: "900",
    color: "#000",
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  body: {
    fontSize: 16,
    fontFamily: FONT_REGULAR,
    color: "#374151",
    lineHeight: 22,
    marginBottom: 24,
  },
  deferredNote: {
    fontSize: 12,
    fontFamily: FONT_REGULAR,
    color: "#9ca3af",
    fontStyle: "italic",
    marginBottom: 24,
    borderLeftWidth: 2,
    borderLeftColor: "#e5e7eb",
    paddingLeft: 12,
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
  secondary: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 12,
  },
  secondaryLabel: {
    color: "#6b7280",
    fontSize: 14,
    fontFamily: FONT_BOLD,
    fontWeight: "700",
  },
});
