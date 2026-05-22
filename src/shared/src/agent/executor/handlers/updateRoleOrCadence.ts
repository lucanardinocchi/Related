import type { UpdateRoleOrCadencePayload } from "../../ambientTools";
import { mergePayload } from "../mergePayload";
import type { ActionHandler } from "../types";

export const updateRoleOrCadenceHandler: ActionHandler = async (
  action,
  userEdits,
  { supabase },
  relationshipId,
) => {
  const merged = mergePayload<UpdateRoleOrCadencePayload>(
    action.payload,
    userEdits?.payload,
  );

  const update: Record<string, unknown> = {};
  if (merged.role !== undefined) update.role = merged.role;
  if (merged.cadence !== undefined) update.cadence = merged.cadence;

  const { error: updErr } = await supabase
    .from("relationships")
    .update(update)
    .eq("id", relationshipId)
    .select()
    .single();
  if (updErr) throw updErr;

  return { decisionState: "picked", mergedPayload: merged };
};
