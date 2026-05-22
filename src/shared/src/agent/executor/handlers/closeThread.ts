import type { CloseThreadPayload } from "../../ambientTools";
import { mergePayload } from "../mergePayload";
import type { ActionHandler } from "../types";

export const closeThreadHandler: ActionHandler = async (
  action,
  userEdits,
  { supabase },
) => {
  const merged = mergePayload<CloseThreadPayload>(action.payload, userEdits?.payload);

  const { error: closeErr } = await supabase
    .from("open_threads")
    .update({ closed_at: new Date().toISOString() })
    .eq("id", merged.openThreadId)
    .select()
    .single();
  if (closeErr) throw closeErr;

  return { decisionState: "picked", mergedPayload: merged };
};
