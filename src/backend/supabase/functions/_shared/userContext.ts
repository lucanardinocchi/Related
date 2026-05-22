import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import type { AmbientUserContextSnapshot } from "../../../../shared/src/agent/userContextCore.ts";
import { assembleUserContextForAmbientPass } from "../../../../shared/src/agent/userContextProjections.ts";
export type { AmbientUserContextSnapshot, AmbientUserContextSnapshot as UserContextSnapshot, GoalEntry, SituationalStateSnapshot, OperatorStrengthEntry } from "../../../../shared/src/agent/userContextCore.ts";
export async function buildUserContext(supabase: SupabaseClient, userId: string, asOf: Date, relationshipId: string): Promise<AmbientUserContextSnapshot> {
  return assembleUserContextForAmbientPass(supabase, { userId, asOf, excludeRelationshipId: relationshipId });
}
