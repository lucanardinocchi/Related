import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AMBIENT_PASS_MODES,
  canRunAmbientIntelligence,
  isAmbientPassMode,
  type AmbientPassMode,
} from "../billing/ambientAccess";
import { AmbientIntelligencePreferencesClient } from "../billing/AmbientIntelligencePreferencesClient";
import type { SubscriptionStatus } from "../billing/SubscriptionsClient";
import { EdgeFunctionAgentCaller } from "./EdgeFunctionAgentCaller";
import { PassEngine, type PassCandidateSet, type PassMode } from "./PassEngine";
import { UserContextBuilder } from "./UserContextBuilder";
import { RelationshipContextBuilder } from "./RelationshipContextBuilder";

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

export interface AmbientPassDispatcherOptions {
  supabase: SupabaseClient;
  passEngine?: PassEngine;
  /** Defaults to `complete_scheduled_pass` RPC. Override in tests or server dispatch. */
  completePass?: (passId: string) => Promise<void>;
  /** Defaults to EdgeFunctionAgentCaller → engaged-pass. */
  agentFunctionName?: string;
}

/**
 * Drains baseline/triggered passes from `scheduled_passes`. Used by the web
 * client historically; production dispatch runs server-side via ambient-dispatch.
 */
export class AmbientPassDispatcher {
  private readonly supabase: SupabaseClient;
  private readonly engine: PassEngine;
  private readonly completePass: (passId: string) => Promise<void>;
  private readonly preferences: AmbientIntelligencePreferencesClient;

  constructor(opts: AmbientPassDispatcherOptions) {
    this.supabase = opts.supabase;
    this.engine =
      opts.passEngine ??
      new PassEngine({
        supabase: opts.supabase,
        agent: new EdgeFunctionAgentCaller({
          supabase: opts.supabase,
          functionName: opts.agentFunctionName,
        }),
        userContextBuilder: new UserContextBuilder({ supabase: opts.supabase }),
        relationshipContextBuilder: new RelationshipContextBuilder({
          supabase: opts.supabase,
        }),
      });
    this.completePass =
      opts.completePass ??
      (async (passId) => {
        const { error } = await this.supabase.rpc("complete_scheduled_pass", {
          p_pass_id: passId,
        });
        if (error) throw error;
      });
    this.preferences = new AmbientIntelligencePreferencesClient(
      opts.supabase,
      async () => {
        const { data } = await opts.supabase.auth.getUser();
        if (!data.user) throw new Error("No signed-in user");
        return data.user.id;
      },
    );
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

  async canDispatchAmbientPasses(): Promise<boolean> {
    const [{ data: authData, error: authErr }, { data, error }, enabled] =
      await Promise.all([
        this.supabase.auth.getUser(),
        this.supabase.from("user_subscriptions").select("status").maybeSingle(),
        this.preferences.isEnabled(),
      ]);
    if (authErr) throw authErr;
    if (error) throw error;
    const status = (data?.status ?? "inactive") as SubscriptionStatus;
    return canRunAmbientIntelligence(
      { status },
      {
        enabled,
        accountCreatedAt: authData.user?.created_at,
      },
    );
  }

  /** @deprecated Use canDispatchAmbientPasses — subscription-only check. */
  async hasActiveSubscription(): Promise<boolean> {
    return this.canDispatchAmbientPasses();
  }

  /**
   * Runs one queued Ambient Pass and marks it dispatched. Returns null when
   * the queue is empty or the User has no active subscription.
   */
  async dispatchNextPendingPass(): Promise<PassCandidateSet | null> {
    if (!(await this.canDispatchAmbientPasses())) {
      return null;
    }

    const pending = await this.listPendingPasses(1);
    const next = pending[0];
    if (!next) return null;

    const result = await this.engine.runPass({
      relationshipId: next.relationshipId,
      mode: next.mode,
    });

    await this.completePass(next.id);

    return result;
  }
}
