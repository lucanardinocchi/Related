import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AMBIENT_PASS_MODES,
  canRunAmbientIntelligence,
  isAmbientPassMode,
  type AmbientPassMode,
} from "../billing/ambientAccess";
import type { SubscriptionStatus } from "../billing/SubscriptionsClient";
import { EdgeFunctionAgentCaller } from "./EdgeFunctionAgentCaller";
import { PassEngine, type CandidateSet, type PassMode } from "./PassEngine";
import { UserContextBuilder } from "./UserContextBuilder";

export interface ScheduledAmbientPass {
  id: string;
  relationshipId: string;
  mode: AmbientPassMode;
  reason: string;
  createdAt: string;
}

interface ScheduledPassRow {
  id: string;
  relationship_id: string;
  mode: string;
  reason: string;
  created_at: string;
}

/**
 * Runs baseline and triggered Agent Passes queued in `scheduled_passes`.
 * Engaged Passes are user-initiated and handled by AgentService instead.
 */
export class AmbientIntelligenceClient {
  private readonly engine: PassEngine;

  constructor(private readonly supabase: SupabaseClient) {
    this.engine = new PassEngine({
      supabase,
      agent: new EdgeFunctionAgentCaller({ supabase }),
      userContextBuilder: new UserContextBuilder({ supabase }),
    });
  }

  async listPendingPasses(limit = 5): Promise<ScheduledAmbientPass[]> {
    const { data, error } = await this.supabase
      .from("scheduled_passes")
      .select("id, relationship_id, mode, reason, created_at")
      .is("dispatched_at", null)
      .in("mode", [...AMBIENT_PASS_MODES])
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw error;

    return ((data ?? []) as ScheduledPassRow[])
      .filter((row): row is ScheduledPassRow & { mode: AmbientPassMode } =>
        isAmbientPassMode(row.mode as PassMode),
      )
      .map((row) => ({
        id: row.id,
        relationshipId: row.relationship_id,
        mode: row.mode,
        reason: row.reason,
        createdAt: row.created_at,
      }));
  }

  async hasActiveSubscription(): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("user_subscriptions")
      .select("status")
      .maybeSingle();
    if (error) throw error;
    const status = (data?.status ?? "inactive") as SubscriptionStatus;
    return canRunAmbientIntelligence({ status });
  }

  /**
   * Runs one queued Ambient Pass and marks it dispatched. Returns null when
   * the queue is empty or the User has no active subscription.
   */
  async dispatchNextPendingPass(): Promise<CandidateSet | null> {
    if (!(await this.hasActiveSubscription())) {
      return null;
    }

    const pending = await this.listPendingPasses(1);
    const next = pending[0];
    if (!next) return null;

    const result = await this.engine.runPass({
      relationshipId: next.relationshipId,
      mode: next.mode,
    });

    const { error: completeError } = await this.supabase.rpc(
      "complete_scheduled_pass",
      { p_pass_id: next.id },
    );
    if (completeError) throw completeError;

    return result;
  }
}
