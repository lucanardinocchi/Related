"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ONBOARDING_WIZARD_STEPS,
  type OnboardingWizardStepId,
} from "./onboardingSteps";

interface Props {
  currentStepId: OnboardingWizardStepId;
  completedStepIds: OnboardingWizardStepId[];
}

export function OnboardingStepChecklist({
  currentStepId,
  completedStepIds,
}: Props) {
  const currentIndex = ONBOARDING_WIZARD_STEPS.findIndex(
    (s) => s.id === currentStepId,
  );

  return (
    <nav aria-label="Setup steps" className="space-y-1">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
        Setup steps
      </p>
      <ol className="space-y-1">
        {ONBOARDING_WIZARD_STEPS.map((step, index) => {
          const done = completedStepIds.includes(step.id);
          const current = step.id === currentStepId;
          const upcoming = index > currentIndex && !done;

          return (
            <li key={step.id}>
              <div
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px]",
                  current && "bg-active font-medium text-fg",
                  !current && done && "text-fg-muted",
                  upcoming && "text-fg-subtle",
                )}
                aria-current={current ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]",
                    done && "border-success bg-success-subtle text-success",
                    current &&
                      !done &&
                      "border-accent bg-accent-subtle text-accent",
                    upcoming && "border-border-strong text-fg-subtle",
                  )}
                  aria-hidden
                >
                  {done ? <Check size={12} strokeWidth={3} /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  {step.label}
                  {step.optional ? (
                    <span className="ml-1 text-[12px] font-normal text-fg-subtle">
                      (optional)
                    </span>
                  ) : null}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
