import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadAmbientPassExtras,
  loadUserContextCore,
  type AmbientPassExtrasSnapshot,
  type AmbientUserContextSnapshot,
  type LoadUserContextCoreOptions,
  type TransientIntentEntry,
  type TransientIntentLoadMode,
  type UserContextCoreSnapshot,
  type UserContextGroupSummary,
  type UserContextRelationshipSummary,
} from "./userContextCore.ts";

export const AMBIENT_PASS_USER_CONTEXT_FLAVOURS = [
  "transientIntent", "situationalState", "goalsAndValues", "operatorStrengths", "inferredSignals",
] as const;
export const CONVERSATIONAL_USER_CONTEXT_FLAVOURS = [
  "goalsAndValues", "situationalState", "recentTransientIntent",
] as const;

export interface ConversationalUserContextSlice {
  goalsAndValues: string[];
  situationalState: string | null;
  recentTransientIntent: ConversationalTransientIntentSummary[];
}
export interface ConversationalTransientIntentSummary {
  content: string; captured_at: string; relationship_id: string | null;
}
export interface ConversationalRelationshipSummary {
  id: string; target_type: "contact" | "group"; role: string | null; cadence: string | null; name: string;
}
export interface ConversationalGroupSummary { id: string; name: string; member_count: number; }
export interface ConversationalUserContextBundle {
  userContext: ConversationalUserContextSlice;
  relationships: ConversationalRelationshipSummary[];
  relationshipsTotal: number;
  groups: ConversationalGroupSummary[];
}
export interface AmbientPassExtras extends AmbientPassExtrasSnapshot { userId: string; }
export interface AssembleAmbientUserContextOptions {
  userId: string; asOf: Date; excludeRelationshipId?: string; transientIntent?: TransientIntentLoadMode;
}

function mapTransientToConversational(rows: TransientIntentEntry[]) {
  return rows.map((r) => ({ content: r.content, captured_at: r.capturedAt, relationship_id: r.relationshipId }));
}
function mapRelationshipToConversational(r: UserContextRelationshipSummary): ConversationalRelationshipSummary {
  return { id: r.id, target_type: r.targetType, role: r.role, cadence: r.cadence, name: r.name };
}
function mapGroupToConversational(g: UserContextGroupSummary): ConversationalGroupSummary {
  return { id: g.id, name: g.name, member_count: g.memberCount };
}

export function projectForAmbientPass(core: UserContextCoreSnapshot, extras: AmbientPassExtras): AmbientUserContextSnapshot {
  return {
    userId: extras.userId, asOf: core.asOf,
    transientIntent: core.transientIntent.map((t) => t.content),
    goalsAndValues: core.goalsAndValues, situationalState: core.situationalState,
    operatorStrengths: extras.operatorStrengths, inferredSignals: extras.inferredSignals,
    groups: core.groups, otherRelationships: core.relationships,
    characterValuesAlignment: extras.characterValuesAlignment,
  };
}
export function projectForEngagedPass(core: UserContextCoreSnapshot, extras: AmbientPassExtras): AmbientUserContextSnapshot {
  return projectForAmbientPass(core, extras);
}
export function projectForConversationalTurn(core: UserContextCoreSnapshot): ConversationalUserContextBundle {
  return {
    userContext: {
      goalsAndValues: core.goalsAndValues.map((g) => g.content),
      situationalState: core.situationalState?.content ?? null,
      recentTransientIntent: mapTransientToConversational(core.transientIntent),
    },
    relationships: core.relationships.map(mapRelationshipToConversational),
    relationshipsTotal: core.relationshipsTotal,
    groups: core.groups.map(mapGroupToConversational),
  };
}
export async function assembleUserContextForAmbientPass(
  supabase: SupabaseClient,
  options: AssembleAmbientUserContextOptions,
): Promise<AmbientUserContextSnapshot> {
  const transientIntent = options.transientIntent ?? { kind: "none" as const };
  const [core, extras] = await Promise.all([
    loadUserContextCore(supabase, {
      asOf: options.asOf, transientIntent,
      excludeRelationshipId: options.excludeRelationshipId,
      groupsOrder: "created_at_desc",
    } satisfies LoadUserContextCoreOptions),
    loadAmbientPassExtras(supabase, options.asOf),
  ]);
  return projectForAmbientPass(core, { userId: options.userId, ...extras });
}
