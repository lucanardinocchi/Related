"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Sparkles } from "lucide-react";
import {
  AMBIENT_TRIAL_DAYS,
  getAmbientTrialDaysRemaining,
  getAmbientTrialEndsAt,
  isWithinAmbientTrial,
  SUBSCRIPTION_PRICE_LABEL,
} from "@related/shared";
import { Card, Checkbox, Section } from "@/components/ui";
import { getBrowserDeps } from "@/lib/deps/client";

interface Props {
  initialEnabled: boolean;
  initialIsSubscribed: boolean;
  accountCreatedAt: string | null;
}

export function AmbientIntelligenceSection({
  initialEnabled,
  initialIsSubscribed,
  accountCreatedAt,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trialActive = useMemo(
    () => isWithinAmbientTrial(accountCreatedAt),
    [accountCreatedAt],
  );
  const trialEndsAt = useMemo(
    () => (accountCreatedAt ? getAmbientTrialEndsAt(accountCreatedAt) : null),
    [accountCreatedAt],
  );
  const trialDaysRemaining = useMemo(
    () => getAmbientTrialDaysRemaining(accountCreatedAt),
    [accountCreatedAt],
  );
  const canEnable = initialIsSubscribed || trialActive;
  const canTurnOn = canEnable && !enabled;

  async function handleToggle(next: boolean) {
    if (next && !canEnable) {
      setError(
        `Subscribe (${SUBSCRIPTION_PRICE_LABEL}) to turn Ambient Intelligence back on.`,
      );
      return;
    }

    setSaving(true);
    setError(null);
    const previous = enabled;
    setEnabled(next);
    try {
      const { ambientIntelligencePreferences } = getBrowserDeps();
      await ambientIntelligencePreferences.setEnabled(next);
    } catch (err) {
      setEnabled(previous);
      setError(
        err instanceof Error ? err.message : "Could not update preference",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Ambient Intelligence" fixed>
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex items-start gap-3">
          <Sparkles size={20} className="mt-0.5 text-fg-muted" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium text-fg">
              Background relationship passes
            </p>
            <p className="mt-1 text-[13px] text-fg-subtle">
              When on, Related runs Ambient Intelligence in the background —
              reviewing relationships and surfacing Candidate Actions for you
              to accept or decline. Turn off to pause all baseline and triggered
              passes.
            </p>
            {trialActive && !initialIsSubscribed && (
              <p className="mt-2 text-[13px] text-fg-subtle">
                Free trial —{" "}
                {trialDaysRemaining === 0
                  ? "ends today"
                  : `${trialDaysRemaining} day${trialDaysRemaining === 1 ? "" : "s"} left`}
                {trialEndsAt ? (
                  <>
                    {" "}
                    (through {format(trialEndsAt, "MMM d")})
                  </>
                ) : null}
                . Subscribe anytime to keep it running after your{" "}
                {AMBIENT_TRIAL_DAYS}-day trial.
              </p>
            )}
            {!trialActive && !initialIsSubscribed && (
              <p className="mt-2 text-[13px] text-fg-subtle">
                Your {AMBIENT_TRIAL_DAYS}-day free trial has ended. Subscribe (
                {SUBSCRIPTION_PRICE_LABEL}) to turn Ambient Intelligence on.
              </p>
            )}
            {initialIsSubscribed && (
              <p className="mt-2 text-[13px] text-fg-subtle">
                Included with your subscription.
              </p>
            )}
          </div>
        </div>

        <label
          className={`flex items-center gap-3 ${canTurnOn || enabled ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
        >
          <Checkbox
            checked={enabled}
            disabled={saving || (!enabled && !canEnable)}
            onChange={(event) => void handleToggle(event.target.checked)}
            aria-describedby="ambient-intelligence-toggle-desc"
          />
          <span
            id="ambient-intelligence-toggle-desc"
            className="text-[14px] text-fg"
          >
            {enabled ? "On" : "Off"}
            {saving ? " — saving…" : null}
          </span>
        </label>

        {error && (
          <p className="text-[13px] text-red-600" role="alert">
            {error}
          </p>
        )}
      </Card>
    </Section>
  );
}
