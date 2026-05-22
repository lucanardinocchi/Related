import type { OpenThreadPayload } from "../../Executor";
import { mergePayload } from "../mergePayload";
import type { ActionHandler } from "../types";

export const openThreadHandler: ActionHandler = async (
  action,
  userEdits,
  { supabase },
  relationshipId,
) => {
  const merged = mergePayload<OpenThreadPayload>(action.payload, userEdits?.payload);
  const relationshipIds =
    merged.relationshipIds && merged.relationshipIds.length > 0
      ? merged.relationshipIds
      : [relationshipId];

  const { error: rpcErr } = await (
    supabase as unknown as {
      rpc: (
        fn: string,
        args: unknown,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc("create_open_thread", {
    p_description: merged.description,
    p_direction: merged.direction,
    p_relationship_ids: relationshipIds,
  });
  if (rpcErr) throw rpcErr;

  return { decisionState: "picked", mergedPayload: merged };
};
