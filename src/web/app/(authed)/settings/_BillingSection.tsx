"use client";

import { useMemo, useState } from "react";
import { CreditCard } from "lucide-react";
import { format } from "date-fns";
import {
  AMBIENT_TRIAL_DAYS,
  getAmbientTrialDaysRemaining,
  getAmbientTrialEndsAt,
  isWithinAmbientTrial,
  SUBSCRIPTION_PRICE_LABEL,
} from "@related/shared";
import { Button, Card, Section } from "@/components/ui";
import {
  createCheckoutSession,
  createPortalSession,
} from "@/lib/billing/stripeClient";
import { getBrowserDeps } from "@/lib/deps/client";

interface Props {
  initialIsActive: boolean;
  initialStatus: string;
  initialCurrentPeriodEnd: string | null;
  initialCancelAtPeriodEnd: boolean;
  initialHasCustomer: boolean;
  accountCreatedAt: string | null;
}

function statusLabel(status: string, cancelAtPeriodEnd: boolean): string {
  if (status === "active" && cancelAtPeriodEnd) return "Active — cancels at period end";
  if (status === "active") return "Active";
  if (status === "trialing") return "Trial";
  if (status === "past_due") return "Past due — update payment method";
  if (status === "canceled") return "Canceled";
  return "Not subscribed";
}

function trialRemainingLabel(
  daysRemaining: number,
  trialEndsAt: Date,
): string {
  const through = format(trialEndsAt, "MMM d, yyyy");
  if (daysRemaining === 0) {
    return `Free trial — ends today (${through})`;
  }
  const dayWord = daysRemaining === 1 ? "day" : "days";
  return `Free trial — ${daysRemaining} ${dayWord} left (through ${through})`;
}

export function BillingSection({
  initialIsActive,
  initialStatus,
  initialCurrentPeriodEnd,
  initialCancelAtPeriodEnd,
  initialHasCustomer,
  accountCreatedAt,
}: Props) {
  const [isActive, setIsActive] = useState(initialIsActive);
  const [status, setStatus] = useState(initialStatus);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState(
    initialCurrentPeriodEnd,
  );
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(
    initialCancelAtPeriodEnd,
  );
  const [working, setWorking] = useState<"checkout" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trialActive = useMemo(
    () => !isActive && isWithinAmbientTrial(accountCreatedAt),
    [accountCreatedAt, isActive],
  );
  const trialDaysRemaining = useMemo(
    () => getAmbientTrialDaysRemaining(accountCreatedAt),
    [accountCreatedAt],
  );
  const trialEndsAt = useMemo(
    () => (accountCreatedAt ? getAmbientTrialEndsAt(accountCreatedAt) : null),
    [accountCreatedAt],
  );

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";

  async function refreshState() {
    const { subscriptions } = getBrowserDeps();
    const state = await subscriptions.getState();
    setIsActive(state.isActive);
    setStatus(state.status);
    setCurrentPeriodEnd(state.currentPeriodEnd);
    setCancelAtPeriodEnd(state.cancelAtPeriodEnd);
  }

  async function handleSubscribe() {
    setWorking("checkout");
    setError(null);
    try {
      const { url } = await createCheckoutSession({
        successUrl: `${origin}/settings/billing/success`,
        cancelUrl: `${origin}/settings`,
      });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setWorking(null);
    }
  }

  async function handleManage() {
    setWorking("portal");
    setError(null);
    try {
      const { url } = await createPortalSession({
        returnUrl: `${origin}/settings`,
      });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open billing portal");
      setWorking(null);
    }
  }

  return (
    <Section title="Subscription" fixed>
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex items-start gap-3">
          <CreditCard size={20} className="mt-0.5 text-fg-muted" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium text-fg">
              Related Pro — {SUBSCRIPTION_PRICE_LABEL}
            </p>
            <p className="mt-1 text-[13px] text-fg-subtle">
              {trialActive && trialEndsAt
                ? trialRemainingLabel(trialDaysRemaining, trialEndsAt)
                : statusLabel(status, cancelAtPeriodEnd)}
              {currentPeriodEnd && isActive && (
                <>
                  {" "}
                  · renews{" "}
                  {format(new Date(currentPeriodEnd), "MMM d, yyyy")}
                </>
              )}
            </p>
            {trialActive && (
              <p className="mt-2 text-[13px] text-fg-subtle">
                Ambient Intelligence is included during your {AMBIENT_TRIAL_DAYS}
                -day trial. Subscribe before it ends to keep it running.
              </p>
            )}
            {!isActive && !trialActive && (
              <p className="mt-2 text-[13px] text-fg-subtle">
                Your {AMBIENT_TRIAL_DAYS}-day free trial has ended. Subscribe to
                unlock Ambient Intelligence.
              </p>
            )}
          </div>
        </div>

        {error && (
          <p className="text-[13px] text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!isActive && (
            <Button
              type="button"
              onClick={handleSubscribe}
              disabled={working !== null}
            >
              {working === "checkout" ? "Redirecting…" : "Subscribe"}
            </Button>
          )}
          {(isActive || initialHasCustomer) && (
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                await handleManage();
              }}
              disabled={working !== null || !initialHasCustomer}
            >
              {working === "portal" ? "Opening…" : "Manage billing"}
            </Button>
          )}
          {!isActive && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void refreshState()}
              disabled={working !== null}
            >
              Refresh status
            </Button>
          )}
        </div>
      </Card>
    </Section>
  );
}
