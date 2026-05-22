import type {
  CharacterValuesAlignmentEntry,
  OperatorStrengthEntry,
  TransientIntentEntry,
  UserContextCoreSnapshot,
  UserContextGroupSummary,
  UserContextRelationshipSummary,
  UserContextSnapshot,
} from "./userContextCore.ts";

/** Conversational user-context slice embedded in ConversationContextSnapshot. */
export interface ConversationalUserContextSlice {
  goalsAndValues: string[];
  situationalState: string | null;
  recentTransientIntent: ConversationalTransientIntentSummary[];
}

export interface ConversationalTransientIntentSummary {
  content: string;
  captured_at: string;
  relationship_id: string | null;
}

/** snake_case summaries used by chat-respond prompt rendering. */
export interface ConversationalRelationshipSummary {
  id: string;
  target_type: "contact" | "group";
  role: string | null;
  cadence: string | null;
  name: string;
}

export interface ConversationalGroupSummary {
  id: string;
  name: string;
  member_count: number;
}

export interface ConversationalUserContextBundle {
  userContext: ConversationalUserContextSlice;
  relationships: ConversationalRelationshipSummary[];
  relationshipsTotal: number;
  groups: ConversationalGroupSummary[];
}

export interface AmbientPassExtras {
  userId: string;
  operatorStrengths: OperatorStrengthEntry[];
  inferredSignals: UserContextSnapshot["inferredSignals"];
  characterValuesAlignment: CharacterValuesAlignmentEntry[];
}

function mapTransientToConversational(
  rows: TransientIntentEntry[],
): ConversationalTransientIntentSummary[] {
  return rows.map((r) => ({
    content: r.content,
    captured_at: r.capturedAt,
    relationship_id: r.relationshipId,
  }));
}

function mapRelationshipToConversational(
  r: UserContextRelationshipSummary,
): ConversationalRelationshipSummary {
  return {
    id: r.id,
    target_type: r.targetType,
    role: r.role,
    cadence: r.cadence,
    name: r.name,
  };
}

function mapGroupToConversational(
  g: UserContextGroupSummary,
): ConversationalGroupSummary {
  return {
    id: g.id,
    name: g.name,
    member_count: g.memberCount,
  };
}

/** Project core load into Ambient Pass UserContextSnapshot. */
export function projectForAmbientPass(
  core: UserContextCoreSnapshot,
  extras: AmbientPassExtras,
): UserContextSnapshot {
  return {
    userId: extras.userId,
    asOf: core.asOf,
    transientIntent: core.transientIntent.map((t) => t.content),
    goalsAndValues: core.goalsAndValues,
    situationalState: core.situationalState,
    operatorStrengths: extras.operatorStrengths,
    inferredSignals: extras.inferredSignals,
    groups: core.groups,
    otherRelationships: core.relationships,
    characterValuesAlignment: extras.characterValuesAlignment,
  };
}

/** Project core load into chat-respond's userContext + relationship/group summaries. */
export function projectForConversationalTurn(
  core: UserContextCoreSnapshot,
): ConversationalUserContextBundle {
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
