"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Card, Checkbox, Section } from "@/components/ui";
import { getBrowserDeps } from "@/lib/deps/client";

interface Props {
  initialEnabled: boolean;
  initialIsSubscribed: boolean;
}

export function AmbientIntelligenceSection({
  initialEnabled,
  initialIsSubscribed,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(next: boolean) {
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
            {!initialIsSubscribed && (
              <p className="mt-2 text-[13px] text-fg-subtle">
                An active subscription is required for passes to run, even when
                this is on.
              </p>
            )}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-3">
          <Checkbox
            checked={enabled}
            disabled={saving}
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
