import type { SupabaseClient } from "@supabase/supabase-js";
import { InteractionsClient } from "../../interactions/InteractionsClient";
import { OpenThreadsClient } from "../../open-threads/OpenThreadsClient";
import type { ContextCaptureWrite, InteractionCaptureWrite, OpenThreadCaptureWrite } from "./types";

export type ManualContextCaptureWriter = {
  mode: "manual"; interactions: InteractionsClient; openThreads: OpenThreadsClient;
};
export type ExtractionContextCaptureWriter = {
  mode: "extraction"; supabase: SupabaseClient; ownerId: string; sourceChatId: string;
  captureSource: "conversational_extraction" | "pocket_extraction";
};
export type ContextCaptureWriter = ManualContextCaptureWriter | ExtractionContextCaptureWriter;
export type ContextCaptureWriteResult =
  | { table: "interactions"; id: string; kind: string }
  | { table: "open_threads"; id: string };

async function writeInteractionManual(write: InteractionCaptureWrite, writer: ManualContextCaptureWriter) {
  return writer.interactions.createInteraction({
    time: write.time, kind: write.kind, category: write.category, notes: write.notes,
    status: write.status, contactIds: write.contactIds, groupId: write.groupId,
  });
}

async function writeInteractionExtraction(write: InteractionCaptureWrite, writer: ExtractionContextCaptureWriter) {
  const { data, error } = await writer.supabase.rpc("extraction_create_interaction", {
    p_owner_id: writer.ownerId, p_source_chat_id: writer.sourceChatId,
    p_capture_source: writer.captureSource, p_time: write.time, p_kind: write.kind,
    p_notes: write.notes, p_status: write.status, p_contact_ids: write.contactIds,
    p_group_id: write.groupId ?? null, p_category: write.category,
  });
  if (error) throw error;
  return data as string;
}

async function writeOpenThreadManual(write: OpenThreadCaptureWrite, writer: ManualContextCaptureWriter) {
  const id = await writer.openThreads.createOpenThread({
    description: write.description, direction: write.direction, relationshipIds: write.relationshipIds,
  });
  if (write.origin !== null || write.communicationStatus !== "not_communicated") {
    await writer.openThreads.setCommitmentMeta(id, {
      origin: write.origin, communicationStatus: write.communicationStatus,
    });
  }
  return id;
}

async function writeOpenThreadExtraction(write: OpenThreadCaptureWrite, writer: ExtractionContextCaptureWriter) {
  const { data, error } = await writer.supabase.rpc("extraction_create_open_thread", {
    p_owner_id: writer.ownerId, p_source_chat_id: writer.sourceChatId,
    p_capture_source: writer.captureSource, p_description: write.description,
    p_direction: write.direction, p_relationship_ids: write.relationshipIds,
    p_origin: write.origin, p_communication_status: write.communicationStatus,
  });
  if (error) throw error;
  return data as string;
}

export async function writeContextCapture(write: ContextCaptureWrite, writer: ContextCaptureWriter) {
  if (write.table === "interactions") {
    const id = writer.mode === "manual"
      ? await writeInteractionManual(write, writer)
      : await writeInteractionExtraction(write, writer);
    return { table: "interactions" as const, id, kind: write.kind };
  }
  const id = writer.mode === "manual"
    ? await writeOpenThreadManual(write, writer)
    : await writeOpenThreadExtraction(write, writer);
  return { table: "open_threads" as const, id };
}
