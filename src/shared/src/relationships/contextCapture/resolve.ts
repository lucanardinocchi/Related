import type { InteractionStatus } from "../../interactions/InteractionsClient.ts";
import type { ThreadDirection } from "../../open-threads/OpenThreadsClient.ts";
import type {
  CommitmentTiming, ContextCaptureInput, ContextCaptureWrite, InteractionTiming,
  RelationshipTarget, ResolveContextCaptureOptions,
} from "./types.ts";

export function interactionStatusFromTiming(timing: InteractionTiming): InteractionStatus {
  return timing === "future" ? "planned" : "occurred";
}

export function interactionStatusFromCommitmentTiming(
  timing: Exclude<CommitmentTiming, "planned">,
): InteractionStatus {
  return timing === "completed" ? "occurred" : "missed";
}

export function interactionStatusForCommitmentTiming(timing: CommitmentTiming): InteractionStatus | null {
  if (timing === "planned") return null;
  return interactionStatusFromCommitmentTiming(timing);
}

export function resolveInteractionStatus(
  input: Extract<ContextCaptureInput, { family: "interaction" }>,
): InteractionStatus {
  if ("status" in input) return input.status;
  return interactionStatusFromTiming(input.timing);
}

export function resolveRelationshipLinkage(target: RelationshipTarget): {
  contactIds: string[]; groupId?: string;
} {
  if (target.mode === "contact") return { contactIds: [target.contactId] };
  if (target.memberContactIds?.length) {
    return { contactIds: target.memberContactIds, groupId: target.groupId };
  }
  return { contactIds: [], groupId: target.groupId };
}

export function relationshipTargetFromResolved(rel: {
  id: string; targetType: "contact" | "group";
  targetContactId: string | null; targetGroupId: string | null;
}): RelationshipTarget {
  if (rel.targetType === "contact") {
    if (!rel.targetContactId) throw new Error(`contact relationship ${rel.id} has no contact`);
    return { mode: "contact", relationshipId: rel.id, contactId: rel.targetContactId };
  }
  if (!rel.targetGroupId) throw new Error(`group relationship ${rel.id} has no group`);
  return { mode: "group", relationshipId: rel.id, groupId: rel.targetGroupId };
}

function provenance(options: ResolveContextCaptureOptions) {
  return {
    captureSource: options.captureSource,
    sourceChatId: options.sourceChatId ?? null,
  };
}

function commitmentRelationshipIds(options: ResolveContextCaptureOptions): string[] {
  if (options.relationshipIds?.length) return options.relationshipIds;
  return [options.relationshipTarget.relationshipId];
}

function resolveCommitmentOpenThreadAxes(
  input: Extract<ContextCaptureInput, { family: "commitment" }>,
  options: ResolveContextCaptureOptions,
) {
  const direction = input.direction ?? "me_owes_them";
  const origin = input.origin !== undefined
    ? input.origin
    : direction === "me_owes_them" && options.captureSource !== "manual"
      ? ("self_led" as const)
      : null;
  const communicationStatus = input.communicationStatus ?? "not_communicated";
  return { direction, origin, communicationStatus };
}

export function resolveContextCapture(
  input: ContextCaptureInput,
  options: ResolveContextCaptureOptions,
): ContextCaptureWrite {
  const { captureSource, sourceChatId } = provenance(options);
  const linkage = resolveRelationshipLinkage(options.relationshipTarget);

  switch (input.family) {
    case "note":
      return {
        table: "interactions", time: input.time, kind: "note", category: "personal",
        notes: input.content?.trim() ? input.content.trim() : null, status: "occurred",
        ...linkage, captureSource, sourceChatId,
      };
    case "comms":
      return {
        table: "interactions", time: input.time, kind: input.channel, category: "personal",
        notes: input.notes?.trim() ? input.notes.trim() : null, status: "occurred",
        ...linkage, captureSource, sourceChatId,
      };
    case "interaction":
      return {
        table: "interactions", time: input.time, kind: input.kind,
        category: input.category ?? "personal",
        notes: input.notes?.trim() ? input.notes.trim() : null,
        status: resolveInteractionStatus(input), ...linkage, captureSource, sourceChatId,
      };
    case "commitment":
      if (input.timing === "planned") {
        const axes = resolveCommitmentOpenThreadAxes(input, options);
        return {
          table: "open_threads", description: input.description.trim(),
          direction: axes.direction, relationshipIds: commitmentRelationshipIds(options),
          origin: axes.origin, communicationStatus: axes.communicationStatus,
          captureSource, sourceChatId,
        };
      }
      return {
        table: "interactions", time: input.time, kind: "commitment", category: "personal",
        notes: input.description.trim(), status: interactionStatusFromCommitmentTiming(input.timing),
        ...linkage, captureSource, sourceChatId,
      };
  }
}

export function parseCaptureTime(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  }
  return fallback;
}
