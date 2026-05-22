import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AmbientPassDispatcher,
  type ScheduledAmbientPass,
} from "./AmbientPassDispatcher";
import type { PassCandidateSet } from "./PassEngine";

export type { ScheduledAmbientPass };

/**
 * Runs baseline and triggered Agent Passes queued in `scheduled_passes`.
 * Engaged Passes are user-initiated and handled by AgentService instead.
 *
 * Pass dispatch for subscribed Users runs server-side (ambient-dispatch Edge
 * Function). The web client uses this class for queue inspection and billing
 * prompts only.
 */
export class AmbientIntelligenceClient {
  private readonly dispatcher: AmbientPassDispatcher;

  constructor(supabase: SupabaseClient) {
    this.dispatcher = new AmbientPassDispatcher({ supabase });
  }

  listPendingPasses(limit = 5): Promise<ScheduledAmbientPass[]> {
    return this.dispatcher.listPendingPasses(limit);
  }

  hasActiveSubscription(): Promise<boolean> {
    return this.dispatcher.hasActiveSubscription();
  }

  /**
   * @deprecated Production dispatch is server-side. Kept for tests and manual tooling.
   */
  dispatchNextPendingPass(): Promise<PassCandidateSet | null> {
    return this.dispatcher.dispatchNextPendingPass();
  }
}
