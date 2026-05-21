"use client";

import type { CandidateSet } from "@related/shared";
import { Badge, Section } from "@/components/ui";
import { fmtDate } from "./_dateFormat";

interface Props {
  candidateSet: CandidateSet;
}

export function RecentCandidateSection({ candidateSet }: Props) {
  if (candidateSet.actions.length === 0) {
    return null;
  }

  return (
    <Section
      title="Recent candidates"
      meta={`${candidateSet.mode} · ${fmtDate(candidateSet.createdAt)}`}
    >
      <ul className="divide-y divide-divider">
        {candidateSet.actions.map((action) => (
          <li key={action.id} className="py-3">
            <div className="text-[14px] font-medium text-fg">{action.type}</div>
            {action.why ? (
              <p className="mt-1 text-[14px] leading-[22px] text-fg-muted">
                {action.why}
              </p>
            ) : null}
            {action.decisionState !== "pending" ? (
              <div className="mt-1">
                <Badge
                  tone={
                    action.decisionState === "picked"
                      ? "approved"
                      : action.decisionState === "declined"
                        ? "lost"
                        : "neutral"
                  }
                >
                  {action.decisionState}
                </Badge>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}
