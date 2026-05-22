import type { DecisionState } from "../candidates/candidateSet";
import type {
  RelationshipContextInteraction,
  RelationshipContextOpenThreadLink,
  RelationshipContextRelationship,
} from "./RelationshipContextBuilder.ts";

export interface CandidateExecutionContext {
  relationship: RelationshipContextRelationship;
  interactions: RelationshipContextInteraction[];
  openThreads: RelationshipContextOpenThreadLink[];
}

/**
 * Whether a picked Candidate Action's side effect is observable in current
 * relationship state. Returns null when not applicable (not approved).
 */
export function inferCandidateExecuted(
  type: string,
  payload: unknown,
  decisionState: DecisionState,
  decidedAt: string | null,
  context: CandidateExecutionContext,
): boolean | null {
  if (decisionState !== "picked") return null;
  if (type === "DoNothing") return null;

  const decidedMs = decidedAt ? new Date(decidedAt).getTime() : 0;
  const afterDecision = (iso: string) =>
    !decidedAt || new Date(iso).getTime() >= decidedMs - 60_000;

  const p =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  switch (type) {
    case "SendMessage":
      // Effect is opening the system composer; pick records completion.
      return true;
    case "LogInteraction":
    case "ScheduleInteraction": {
      const time = typeof p.time === "string" ? p.time : null;
      const kind = typeof p.kind === "string" ? p.kind : null;
      const contactIds = Array.isArray(p.contactIds)
        ? (p.contactIds as string[])
        : [];
      if (!time || !kind) return false;
      return context.interactions.some(
        (i) =>
          afterDecision(i.created_at) &&
          i.time === time &&
          i.kind === kind &&
          (contactIds.length === 0 ||
            i.interaction_contacts.some((ic) =>
              contactIds.includes(ic.contact_id),
            )),
      );
    }
    case "OpenThread": {
      const description =
        typeof p.description === "string" ? p.description.trim() : "";
      if (!description) return false;
      return context.openThreads.some(
        (link) =>
          afterDecision(link.open_threads.created_at) &&
          link.open_threads.description.trim() === description &&
          link.open_threads.closed_at === null,
      );
    }
    case "CloseThread": {
      const openThreadId =
        typeof p.openThreadId === "string" ? p.openThreadId : null;
      if (!openThreadId) return false;
      const link = context.openThreads.find(
        (l) => l.open_threads.id === openThreadId,
      );
      return link?.open_threads.closed_at != null;
    }
    case "UpdateRoleOrCadence": {
      const rel = context.relationship;
      const roleMatch =
        p.role === undefined ||
        (typeof p.role === "string" && rel.role === p.role);
      const cadenceMatch =
        p.cadence === undefined ||
        (typeof p.cadence === "string" && rel.cadence === p.cadence);
      return roleMatch && cadenceMatch;
    }
    default:
      return false;
  }
}
