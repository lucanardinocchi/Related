// Server-side Ambient Intelligence dispatch — drains scheduled_passes using
// service role. Deno mirror of AmbientPassDispatcher flow.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { runAmbientPass } from "./ambientPassRunner.ts";

const AMBIENT_PASS_MODES = ["baseline", "triggered"] as const;

export interface ScheduledAmbientPassRow {
  id: string;
  owner_id: string;
  relationship_id: string;
  mode: "baseline" | "triggered";
  reason: string;
}

export interface DispatchAmbientPassResult {
  status: "empty" | "skipped" | "dispatched" | "failed";
  passId?: string;
  relationshipId?: string;
  mode?: string;
  candidateSetId?: string;
  error?: string;
}

async function pickNextPendingPass(
  service: SupabaseClient,
): Promise<ScheduledAmbientPassRow | null> {
  const { data, error } = await service
    .from("scheduled_passes")
    .select("id, owner_id, relationship_id, mode, reason")
    .is("dispatched_at", null)
    .in("mode", [...AMBIENT_PASS_MODES])
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) throw error;

  for (const row of data ?? []) {
    const pass = row as ScheduledAmbientPassRow;
    const { data: canRun, error: canErr } = await service.rpc(
      "can_run_ambient_intelligence",
      { p_owner_id: pass.owner_id },
    );
    if (canErr) throw canErr;
    if (canRun) {
      return pass;
    }
  }

  return null;
}

async function completeScheduledPassService(
  service: SupabaseClient,
  passId: string,
): Promise<void> {
  const { error } = await service.rpc("complete_scheduled_pass_service", {
    p_pass_id: passId,
  });
  if (error) throw error;
}

export async function dispatchNextAmbientPass(
  service: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<DispatchAmbientPassResult> {
  const next = await pickNextPendingPass(service);
  if (!next) {
    return { status: "empty" };
  }

  try {
    const { candidateSetId } = await runAmbientPass(
      service,
      supabaseUrl,
      serviceRoleKey,
      {
        relationshipId: next.relationship_id,
        mode: next.mode,
      },
    );
    await completeScheduledPassService(service, next.id);
    return {
      status: "dispatched",
      passId: next.id,
      relationshipId: next.relationship_id,
      mode: next.mode,
      candidateSetId,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : JSON.stringify(err);
    return {
      status: "failed",
      passId: next.id,
      relationshipId: next.relationship_id,
      mode: next.mode,
      error: message,
    };
  }
}

export async function drainAmbientPasses(
  service: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string,
  limit = 1,
): Promise<DispatchAmbientPassResult[]> {
  const results: DispatchAmbientPassResult[] = [];
  for (let i = 0; i < limit; i += 1) {
    const result = await dispatchNextAmbientPass(
      service,
      supabaseUrl,
      serviceRoleKey,
    );
    results.push(result);
    if (result.status === "empty") break;
  }
  return results;
}
