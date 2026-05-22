import type { PassMode } from "../candidates/candidateSet";
import { isActiveSubscriptionStatus } from "./SubscriptionsClient";
import type { SubscriptionState } from "./SubscriptionsClient";

/** Pass modes that are Ambient Intelligence (not user-initiated Engaged). */
export const AMBIENT_PASS_MODES = ["baseline", "triggered"] as const;

export type AmbientPassMode = (typeof AMBIENT_PASS_MODES)[number];

/** Free Ambient Intelligence window from account creation — keep in sync with SQL. */
export const AMBIENT_TRIAL_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isAmbientPassMode(mode: PassMode): mode is AmbientPassMode {
  return (AMBIENT_PASS_MODES as readonly string[]).includes(mode);
}

export function isAmbientIntelligenceEnabled(
  preferences: { enabled: boolean } | null | undefined,
): boolean {
  return preferences?.enabled ?? true;
}

export function getAmbientTrialEndsAt(
  accountCreatedAt: string | Date,
): Date {
  const created =
    accountCreatedAt instanceof Date
      ? accountCreatedAt
      : new Date(accountCreatedAt);
  return new Date(created.getTime() + AMBIENT_TRIAL_DAYS * MS_PER_DAY);
}

export function isWithinAmbientTrial(
  accountCreatedAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!accountCreatedAt) return false;
  return now < getAmbientTrialEndsAt(accountCreatedAt);
}

/** Whole calendar days until the Ambient trial ends (0 on the last day). */
export function getAmbientTrialDaysRemaining(
  accountCreatedAt: string | Date | null | undefined,
  now: Date = new Date(),
): number {
  if (!accountCreatedAt || !isWithinAmbientTrial(accountCreatedAt, now)) {
    return 0;
  }
  const endsAt = getAmbientTrialEndsAt(accountCreatedAt);
  const fromDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const toDay = Date.UTC(
    endsAt.getUTCFullYear(),
    endsAt.getUTCMonth(),
    endsAt.getUTCDate(),
  );
  return Math.max(0, Math.round((toDay - fromDay) / MS_PER_DAY));
}

export function hasAmbientIntelligenceAccess(
  subscription: Pick<SubscriptionState, "status">,
  options?: { accountCreatedAt?: string | null },
): boolean {
  if (isActiveSubscriptionStatus(subscription.status)) return true;
  return isWithinAmbientTrial(options?.accountCreatedAt);
}

export function canEnableAmbientIntelligence(
  subscription: Pick<SubscriptionState, "status">,
  options?: { accountCreatedAt?: string | null },
): boolean {
  return hasAmbientIntelligenceAccess(subscription, options);
}

export function canRunAmbientIntelligence(
  subscription: Pick<SubscriptionState, "status">,
  options?: { enabled?: boolean; accountCreatedAt?: string | null },
): boolean {
  const enabled = options?.enabled ?? true;
  return (
    enabled &&
    hasAmbientIntelligenceAccess(subscription, {
      accountCreatedAt: options?.accountCreatedAt,
    })
  );
}
