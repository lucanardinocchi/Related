import { getServerDeps } from "@/lib/deps/server";
import { OnboardingFlow } from "./OnboardingFlow";

export const dynamic = "force-dynamic";

/**
 * Onboarding entry — web edition.
 *
 * On web, the only step we surface is "Connect Google Calendar". HealthKit
 * is iOS-only, and contacts/goals setup are deferred until the native build
 * ships. We still call `startIfNeeded()` server-side so the User has an
 * onboarding_state row to mutate when they connect, then hand off to the
 * client component for the OAuth handshake (which needs `window.location`
 * + `onAuthStateChange` and so has to run in the browser).
 */
export default async function OnboardingPage() {
  const { onboarding } = await getServerDeps();
  // startIfNeeded is idempotent — returns the existing row if one exists,
  // otherwise inserts a fresh empty state.
  const initialState = await onboarding.startIfNeeded();
  const calendarConnected = initialState.completedSteps.includes("calendar");

  return (
    <OnboardingFlow
      initialCalendarConnected={calendarConnected}
    />
  );
}
