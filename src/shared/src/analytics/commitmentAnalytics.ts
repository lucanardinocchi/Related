import type { OpenThread } from "../open-threads/OpenThreadsClient";

/**
 * Header analytics for the web /commitments page (per ADR-0008). The page
 * filters the underlying Open Threads list to `direction = me_owes_them`;
 * this helper expects that filter to have already been applied (the count
 * fields all assume the input is the User's open Commitments).
 *
 * Returns the breakdowns the UI surfaces above the list:
 *   - by origin (asked_of_me vs self_led vs unset)
 *   - by communication_status (confirmed vs not_communicated)
 *   - a crosstab of the two axes for sub-bucket counts
 */
export interface CommitmentAnalytics {
  total: number;
  byOrigin: {
    askedOfMe: number;
    selfLed: number;
    unset: number;
  };
  byCommunicationStatus: {
    confirmed: number;
    notCommunicated: number;
  };
  /**
   * `[origin][status] = count`, only over rows where origin is set.
   * Useful for "self-led but not yet communicated" — the highest-friction
   * bucket the User typically wants to clear first.
   */
  crosstab: {
    asked_of_me: { confirmed: number; not_communicated: number };
    self_led: { confirmed: number; not_communicated: number };
  };
}

export function commitmentAnalytics(input: {
  commitments: OpenThread[];
}): CommitmentAnalytics {
  const byOrigin = { askedOfMe: 0, selfLed: 0, unset: 0 };
  const byCommunicationStatus = { confirmed: 0, notCommunicated: 0 };
  const crosstab = {
    asked_of_me: { confirmed: 0, not_communicated: 0 },
    self_led: { confirmed: 0, not_communicated: 0 },
  };

  for (const c of input.commitments) {
    if (c.origin === "asked_of_me") byOrigin.askedOfMe += 1;
    else if (c.origin === "self_led") byOrigin.selfLed += 1;
    else byOrigin.unset += 1;

    if (c.communicationStatus === "confirmed") byCommunicationStatus.confirmed += 1;
    else byCommunicationStatus.notCommunicated += 1;

    if (c.origin === "asked_of_me" || c.origin === "self_led") {
      crosstab[c.origin][c.communicationStatus] += 1;
    }
  }

  return {
    total: input.commitments.length,
    byOrigin,
    byCommunicationStatus,
    crosstab,
  };
}
