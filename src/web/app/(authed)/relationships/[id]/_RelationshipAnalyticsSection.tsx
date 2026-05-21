"use client";

import type { RelationshipAnalytics } from "@related/shared";
import {
  AnalyticTile,
  AnalyticsRow,
  Mono,
  Section,
} from "@/components/ui";

interface Props {
  analytics: RelationshipAnalytics;
}

export function RelationshipAnalyticsSection({ analytics }: Props) {
  return (
    <Section title="Analytics">
      <AnalyticsRow>
        <AnalyticTile
          label="Interactions"
          value={<Mono>{analytics.totalInteractions}</Mono>}
        />
        <AnalyticTile
          label="Last 30 days"
          value={<Mono>{analytics.interactionsLast30Days}</Mono>}
        />
        <AnalyticTile
          label="Days since last"
          value={
            <Mono>
              {analytics.daysSinceLastInteraction === null
                ? "—"
                : analytics.daysSinceLastInteraction}
            </Mono>
          }
        />
        <AnalyticTile
          label="Open commitments"
          value={<Mono>{analytics.openCommitments}</Mono>}
        />
      </AnalyticsRow>
    </Section>
  );
}
