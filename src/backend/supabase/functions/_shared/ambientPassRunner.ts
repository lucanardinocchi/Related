// Deno Adapter — delegates to shared Agent Pass orchestration. No logic here.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import type { SupabaseClient as NodeSupabaseClient } from "@supabase/supabase-js";
import { runAgentPass, type PassMode, type RunPassInput } from "../../../../shared/src/agent/agentPassRun.ts";
import { EdgeFunctionAgentCaller } from "../../../../shared/src/agent/EdgeFunctionAgentCaller.ts";
import { buildRelationshipContext } from "./relationshipContext.ts";
import { buildUserContext } from "./userContext.ts";

export type { PassMode };

export async function runAmbientPass(
  service: SupabaseClient,
  _supabaseUrl: string,
  _serviceRoleKey: string,
  input: RunPassInput,
): Promise<{ candidateSetId: string; ownerId: string }> {
  const supabase = service as unknown as NodeSupabaseClient;
  const result = await runAgentPass({
    supabase,
    agent: new EdgeFunctionAgentCaller({ supabase, functionName: "ambient-pass" }),
    buildRelationshipContext: (relationshipId) => buildRelationshipContext(service, relationshipId),
    buildUserContext: (userId, asOf, relationshipId) => buildUserContext(service, userId, asOf, relationshipId),
  }, input);
  return { candidateSetId: result.id, ownerId: result.ownerId };
}
