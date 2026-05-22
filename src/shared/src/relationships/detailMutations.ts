import type {
  Interaction,
  InteractionCategory,
  InteractionContact,
  InteractionStatus,
} from "../interactions/InteractionsClient";
import type {
  CommitmentCommunicationStatus,
  CommitmentOrigin,
  OpenThread,
  ThreadDirection,
} from "../open-threads/OpenThreadsClient";

export const MANUAL_CAPTURE_SOURCE = "manual" as const;

export function sortInteractionsByTime(
  interactions: Interaction[],
): Interaction[] {
  return [...interactions].sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
  );
}

export function buildManualInteraction(
  id: string,
  input: {
    time: string;
    kind: string;
    category: InteractionCategory;
    notes: string | null;
    status: InteractionStatus;
  },
  contacts: InteractionContact[],
): Interaction {
  return {
    id,
    time: input.time,
    kind: input.kind,
    category: input.category,
    notes: input.notes,
    status: input.status,
    contacts,
    captureSource: MANUAL_CAPTURE_SOURCE,
    sourceChatId: null,
  };
}

export function buildManualOpenThread(
  id: string,
  input: {
    description: string;
    direction?: ThreadDirection;
    relationshipIds: string[];
    origin?: CommitmentOrigin | null;
    communicationStatus?: CommitmentCommunicationStatus;
  },
): OpenThread {
  return {
    id,
    description: input.description,
    direction: input.direction ?? "me_owes_them",
    origin: input.origin ?? null,
    communicationStatus: input.communicationStatus ?? "not_communicated",
    createdAt: new Date().toISOString(),
    closedAt: null,
    relationshipIds: input.relationshipIds,
    whyHelpsPerson: null,
    whyICanHelp: null,
    captureSource: MANUAL_CAPTURE_SOURCE,
    sourceChatId: null,
  };
}

export function trimToNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
