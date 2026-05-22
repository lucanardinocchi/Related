// Deno mirror: src/shared/src/agent/RelationshipContextBuilder.ts — keep in sync.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import {
  RelationshipContextBuilder,
  type RelationshipContextSnapshot,
} from "../../../../shared/src/agent/RelationshipContextBuilder.ts";

export type {
  RelationshipContextContact,
  RelationshipContextGroup,
  RelationshipContextInteraction,
  RelationshipContextOpenThread,
  RelationshipContextOpenThreadLink,
  RelationshipContextRelationship,
  RelationshipContextSnapshot,
  RelationshipContextEvent,
  SuggestedActionHistoryEntry,
} from "../../../../shared/src/agent/RelationshipContextBuilder.ts";

export { RelationshipContextBuilder };

export async function buildRelationshipContext(
  supabase: SupabaseClient,
  relationshipId: string,
): Promise<RelationshipContextSnapshot> {
  return new RelationshipContextBuilder({ supabase }).buildRelationshipContext(
    relationshipId,
  );
}
