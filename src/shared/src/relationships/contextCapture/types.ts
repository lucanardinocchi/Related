import type {
  ContextCaptureSource,
  InteractionCategory,
  InteractionStatus,
} from "../../interactions/InteractionsClient";
import type {
  CommitmentCommunicationStatus,
  CommitmentOrigin,
  ThreadDirection,
} from "../../open-threads/OpenThreadsClient";

export type ContextFamily = "interaction" | "note" | "comms" | "commitment";
export type InteractionTiming = "past" | "future";
export type CommitmentTiming = "planned" | "completed" | "missed";

export const COMMS_KINDS = [
  "instagram_dm",
  "x_dm",
  "whatsapp",
  "tiktok_dm",
  "imessage",
  "email",
  "phone_call",
] as const;
export type CommsKind = (typeof COMMS_KINDS)[number];

export type NoteCaptureInput = { family: "note"; time: string; content: string | null };
export type CommsCaptureInput = {
  family: "comms"; time: string; channel: CommsKind | string; notes: string | null;
};
export type InteractionCaptureInput = {
  family: "interaction"; time: string; kind: string; notes: string | null; category?: InteractionCategory;
} & ({ timing: InteractionTiming } | { status: InteractionStatus });
export type CommitmentCaptureInput = {
  family: "commitment"; time: string; description: string; timing: CommitmentTiming;
  direction?: ThreadDirection; origin?: CommitmentOrigin | null;
  communicationStatus?: CommitmentCommunicationStatus;
};
export type ContextCaptureInput =
  | NoteCaptureInput | CommsCaptureInput | InteractionCaptureInput | CommitmentCaptureInput;

export type ContactRelationshipTarget = {
  mode: "contact"; relationshipId: string; contactId: string;
};
export type GroupRelationshipTarget = {
  mode: "group"; relationshipId: string; groupId: string; memberContactIds?: string[];
};
export type RelationshipTarget = ContactRelationshipTarget | GroupRelationshipTarget;

export type InteractionCaptureWrite = {
  table: "interactions"; time: string; kind: string; category: InteractionCategory;
  notes: string | null; status: InteractionStatus; contactIds: string[]; groupId?: string;
  captureSource: ContextCaptureSource; sourceChatId: string | null;
};
export type OpenThreadCaptureWrite = {
  table: "open_threads"; description: string; direction: ThreadDirection; relationshipIds: string[];
  origin: CommitmentOrigin | null; communicationStatus: CommitmentCommunicationStatus;
  captureSource: ContextCaptureSource; sourceChatId: string | null;
};
export type ContextCaptureWrite = InteractionCaptureWrite | OpenThreadCaptureWrite;

export type ResolveContextCaptureOptions = {
  captureSource: ContextCaptureSource; sourceChatId?: string | null;
  relationshipTarget: RelationshipTarget; relationshipIds?: string[];
};
