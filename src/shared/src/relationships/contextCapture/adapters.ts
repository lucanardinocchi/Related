import type { InteractionCategory, InteractionStatus } from "../../interactions/InteractionsClient.ts";
import type { CommitmentCommunicationStatus, CommitmentOrigin, ThreadDirection } from "../../open-threads/OpenThreadsClient.ts";
import type { CommitmentTiming, ContextCaptureInput, ContextFamily } from "./types.ts";

export type ModalContextCapturePayload = {
  family: ContextFamily; time: string; notes: string | null;
  interaction?: { kind: string; category: InteractionCategory; status: InteractionStatus };
  commitment?: { description: string; timing: CommitmentTiming };
};

export function contextCaptureInputFromModal(payload: ModalContextCapturePayload): ContextCaptureInput {
  if (payload.commitment) {
    return { family: "commitment", time: payload.time, description: payload.commitment.description, timing: payload.commitment.timing };
  }
  if (payload.family === "note") return { family: "note", time: payload.time, content: payload.notes };
  if (payload.family === "comms") {
    return { family: "comms", time: payload.time, channel: payload.interaction!.kind, notes: payload.notes };
  }
  return {
    family: "interaction", time: payload.time, kind: payload.interaction!.kind,
    category: payload.interaction!.category, notes: payload.notes, status: payload.interaction!.status,
  };
}

export type ExtractionToolName = "log_note" | "log_interaction" | "log_comms" | "open_commitment";

export function contextCaptureInputFromExtractionTool(
  toolName: ExtractionToolName, input: Record<string, unknown>, defaultTime: string,
): ContextCaptureInput {
  switch (toolName) {
    case "log_note": {
      const relationshipId = input.relationship_id as string;
      const content = input.content as string;
      if (!relationshipId || !content?.trim()) throw new Error("relationship_id and content required");
      return { family: "note", time: parseTimeField(input.time, defaultTime), content: content.trim() };
    }
    case "log_interaction": {
      const relationshipId = input.relationship_id as string;
      const kind = input.kind as string;
      const status = input.status as InteractionStatus;
      if (!relationshipId || !kind?.trim() || !status) throw new Error("relationship_id, kind, and status required");
      return {
        family: "interaction", time: parseTimeField(input.time, defaultTime), kind: kind.trim(),
        notes: (input.notes as string | undefined)?.trim() || null,
        category: (input.category as InteractionCategory | undefined) ?? "personal", status,
      };
    }
    case "log_comms": {
      const relationshipId = input.relationship_id as string;
      const channel = input.channel as string;
      if (!relationshipId || !channel) throw new Error("relationship_id and channel required");
      return {
        family: "comms", time: parseTimeField(input.time, defaultTime), channel,
        notes: (input.notes as string | undefined)?.trim() || null,
      };
    }
    case "open_commitment": {
      const relationshipIds = input.relationship_ids as string[];
      const description = input.description as string;
      const direction = input.direction as ThreadDirection;
      if (!Array.isArray(relationshipIds) || relationshipIds.length === 0 || !description?.trim() || !direction) {
        throw new Error("relationship_ids, description, and direction required");
      }
      return {
        family: "commitment", time: defaultTime, description: description.trim(), timing: "planned", direction,
        origin: (input.origin as CommitmentOrigin | undefined) ?? undefined,
        communicationStatus: (input.communication_status as CommitmentCommunicationStatus | undefined) ?? undefined,
      };
    }
  }
}

function parseTimeField(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  }
  return fallback;
}
