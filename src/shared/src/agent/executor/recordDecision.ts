import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserEdits } from "../Executor";

export async function recordDecision(
  supabase: SupabaseClient,
  actionId: string,
  decisionState: "picked" | "declined" | "ignored",
  userEdits: UserEdits | undefined,
): Promise<void> {
  const update: Record<string, unknown> = {
    decision_state: decisionState,
    decided_at: new Date().toISOString(),
  };
  if (userEdits?.payload !== undefined) update.payload = userEdits.payload;
  if (userEdits?.why !== undefined) update.why = userEdits.why;

  const { error } = await supabase
    .from("candidate_actions")
    .update(update)
    .eq("id", actionId)
    .select()
    .single();
  if (error) throw error;
}
