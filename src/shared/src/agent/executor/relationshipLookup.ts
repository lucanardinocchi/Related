import type { SupabaseClient } from "@supabase/supabase-js";

export async function relationshipIdForSet(
  supabase: SupabaseClient,
  candidateSetId: string,
): Promise<string> {
  const { data: row, error } = await supabase
    .from("candidate_sets")
    .select("id, relationship_id")
    .eq("id", candidateSetId)
    .single();
  if (error || !row) throw error ?? new Error("candidate set not found");
  return (row as { relationship_id: string }).relationship_id;
}
