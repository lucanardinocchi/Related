import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LogInteractionPayload,
  ScheduleInteractionPayload,
} from "../../ambientTools";
import { mergePayload } from "../mergePayload";
import type { ActionHandler } from "../types";

async function createInteraction(
  supabase: SupabaseClient,
  merged: ScheduleInteractionPayload | LogInteractionPayload,
  status: "planned" | "occurred",
): Promise<string | undefined> {
  const { data: interactionId, error: rpcErr } = await (
    supabase as unknown as {
      rpc: (
        fn: string,
        args: unknown,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc("create_interaction", {
    p_time: merged.time,
    p_kind: merged.kind,
    p_notes: merged.notes ?? null,
    p_status: status,
    p_contact_ids: merged.contactIds,
  });
  if (rpcErr) throw rpcErr;
  return (interactionId as string) ?? undefined;
}

export const scheduleInteractionHandler: ActionHandler = async (
  action,
  userEdits,
  { supabase },
) => {
  const merged = mergePayload<ScheduleInteractionPayload>(
    action.payload,
    userEdits?.payload,
  );
  const interactionId = await createInteraction(supabase, merged, "planned");
  return {
    decisionState: "picked",
    mergedPayload: merged,
    effects: { interactionId },
  };
};

export const logInteractionHandler: ActionHandler = async (
  action,
  userEdits,
  { supabase },
) => {
  const merged = mergePayload<LogInteractionPayload>(
    action.payload,
    userEdits?.payload,
  );
  const interactionId = await createInteraction(supabase, merged, "occurred");
  return {
    decisionState: "picked",
    mergedPayload: merged,
    effects: { interactionId },
  };
};
