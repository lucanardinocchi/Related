import type { PassMode } from "../candidates/candidateSet";
import { isActiveSubscriptionStatus } from "./SubscriptionsClient";
import type { SubscriptionState } from "./SubscriptionsClient";

/** Pass modes that are Ambient Intelligence (not user-initiated Engaged). */
export const AMBIENT_PASS_MODES = ["baseline", "triggered"] as const;

export type AmbientPassMode = (typeof AMBIENT_PASS_MODES)[number];

export function isAmbientPassMode(mode: PassMode): mode is AmbientPassMode {
  return (AMBIENT_PASS_MODES as readonly string[]).includes(mode);
}

export function isAmbientIntelligenceEnabled(
  preferences: { enabled: boolean } | null | undefined,
): boolean {
  return preferences?.enabled ?? true;
}

export function canRunAmbientIntelligence(
  subscription: Pick<SubscriptionState, "status">,
  options?: { enabled?: boolean },
): boolean {
  const enabled = options?.enabled ?? true;
  return enabled && isActiveSubscriptionStatus(subscription.status);
}
