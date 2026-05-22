// Deno mirror: src/shared/src/agent/UserContextBuilder.ts — keep in sync.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { UserContextBuilder } from "../../../../shared/src/agent/UserContextBuilder.ts";

export type {
  AmbientUserContextSnapshot,
  AmbientUserContextSnapshot as UserContextSnapshot,
  GoalEntry,
  SituationalStateSnapshot,
  OperatorStrengthEntry,
} from "../../../../shared/src/agent/userContextCore.ts";

export { UserContextBuilder };

export async function buildUserContext(
  supabase: SupabaseClient,
  userId: string,
  asOf: Date,
): Promise<import("../../../../shared/src/agent/userContextCore.ts").AmbientUserContextSnapshot> {
  return new UserContextBuilder({ supabase }).buildUserContext(userId, asOf);
}
