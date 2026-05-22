// Shared Pocket import helpers for pocket-sync, pocket-webhook, pocket-process-pending.
// Pure import steps live in @related/shared PocketImportPipeline; this module is the
// Deno edge adapter for Pocket API + Supabase persistence.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { runPocketImportPipeline } from "../../../../shared/src/integrations/pocket/pocketImportPipeline.ts";

export const POCKET_API = "https://public.heypocketai.com/api/v1/public";
export const IMPORT_DELAY_MS = 15 * 60 * 1000;

export interface PocketRecordingSummary {
  id: string;
  title?: string | null;
  created_at?: string | null;
}

export type SupabaseServiceClient = ReturnType<typeof createClient>;

export async function pocketFetch<T>(
  apiKey: string,
  path: string,
  query?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${POCKET_API}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const json = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || json.success === false) {
    const err = typeof json.error === "string"
      ? json.error
      : `Pocket API ${response.status}`;
    throw new Error(err);
  }
  return json as T;
}

export async function invokeExtractContext(
  supabaseUrl: string,
  serviceRoleKey: string,
  ownerId: string,
  chatId: string,
): Promise<void> {
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/functions/v1/extract-context`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chatId, ownerId }),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`extract-context ${response.status}: ${text.slice(0, 200)}`);
  }
}

export async function recordAmbiguity(
  supabase: SupabaseServiceClient,
  ownerId: string,
  recording: PocketRecordingSummary,
  speakers: string[],
  transcriptSegments?: Array<{ speaker?: string | null; text?: string | null }>,
): Promise<void> {
  await supabase.from("pocket_speaker_ambiguities").upsert(
    {
      owner_id: ownerId,
      recording_id: recording.id,
      recording_title: recording.title ?? null,
      recording_created_at: recording.created_at ?? null,
      speakers,
      transcript_segments: transcriptSegments ?? null,
      resolved_at: null,
      resolved_speaker: null,
    },
    { onConflict: "owner_id,recording_id" },
  );
}

export type PocketSpeakerAssignmentPayload =
  | { kind: "self" }
  | { kind: "contact"; contactId: string };

export async function importRecording(
  supabase: SupabaseServiceClient,
  supabaseUrl: string,
  serviceRoleKey: string,
  ownerId: string,
  recording: PocketRecordingSummary,
  apiKey: string,
  accountDisplayName: string,
  options?: {
    userSpeakerOverride?: string;
    speakerAssignments?: Record<string, PocketSpeakerAssignmentPayload>;
    contactNamesById?: Record<string, string>;
    /** When resolving from stored ambiguity preview, skip Pocket API fetch. */
    transcript?: unknown;
  },
): Promise<
  | { status: "imported"; chatId: string }
  | { status: "ambiguous"; speakers: string[] }
  | { status: "skipped"; reason: string }
> {
  let transcript: unknown = options?.transcript;
  if (transcript === undefined) {
    const detail = await pocketFetch<{ data?: Record<string, unknown> }>(
      apiKey,
      `/recordings/${recording.id}`,
      {
        include_transcript: "true",
        include_summarizations: "false",
      },
    );
    transcript = detail.data?.transcript;
  }

  const pipeline = runPocketImportPipeline({
    transcript,
    accountDisplayName,
    recordingTitle: recording.title,
    userSpeakerOverride: options?.userSpeakerOverride,
    speakerAssignments: options?.speakerAssignments,
    contactNamesById: options?.contactNamesById,
  });

  if (pipeline.status === "skipped") {
    return { status: "skipped", reason: pipeline.reason };
  }
  if (pipeline.status === "ambiguous") {
    await recordAmbiguity(
      supabase,
      ownerId,
      recording,
      pipeline.speakers,
      pipeline.segments,
    );
    return { status: "ambiguous", speakers: pipeline.speakers };
  }

  const now = new Date().toISOString();

  const chatInsert = await supabase
    .from("chats")
    .insert({
      owner_id: ownerId,
      title: pipeline.chatTitle,
      source: "pocket",
      external_id: recording.id,
      closed_at: now,
      created_at: recording.created_at ?? now,
    })
    .select("id")
    .single();
  if (chatInsert.error || !chatInsert.data) {
    throw new Error(chatInsert.error?.message ?? "failed to create chat");
  }
  const chatId = chatInsert.data.id as string;

  const rows = pipeline.messages.map((m) => ({
    chat_id: chatId,
    owner_id: ownerId,
    role: m.role,
    content: m.content,
  }));
  const msgInsert = await supabase.from("chat_messages").insert(rows);
  if (msgInsert.error) {
    throw new Error(msgInsert.error.message);
  }

  const importInsert = await supabase.from("pocket_imports").insert({
    owner_id: ownerId,
    recording_id: recording.id,
    chat_id: chatId,
    recording_title: recording.title ?? null,
  });
  if (importInsert.error) {
    throw new Error(importInsert.error.message);
  }

  await supabase
    .from("pocket_speaker_ambiguities")
    .delete()
    .eq("owner_id", ownerId)
    .eq("recording_id", recording.id);

  await invokeExtractContext(supabaseUrl, serviceRoleKey, ownerId, chatId);

  return { status: "imported", chatId };
}

export async function processPendingImportForOwner(
  service: SupabaseServiceClient,
  supabaseUrl: string,
  serviceRoleKey: string,
  ownerId: string,
  recordingId: string,
  userSpeakerOverride?: string,
): Promise<
  | { status: "imported"; chatId: string }
  | { status: "ambiguous" }
  | { status: "skipped"; reason: string }
  | { status: "already_imported" }
> {
  const importedRes = await service
    .from("pocket_imports")
    .select("recording_id")
    .eq("owner_id", ownerId)
    .eq("recording_id", recordingId)
    .maybeSingle();
  if (importedRes.data) {
    return { status: "already_imported" };
  }

  const tokenRes = await service
    .from("user_provider_tokens")
    .select("access_token")
    .eq("owner_id", ownerId)
    .eq("provider", "pocket")
    .maybeSingle();
  if (!tokenRes.data?.access_token) {
    throw new Error("Pocket is not connected");
  }

  const integrationRes = await service
    .from("pocket_integration")
    .select("account_display_name, connected_at")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!integrationRes.data) {
    throw new Error("Pocket integration metadata missing");
  }

  const pendingRes = await service
    .from("pocket_pending_imports")
    .select("recording_title, recording_created_at, transcription_completed_at")
    .eq("owner_id", ownerId)
    .eq("recording_id", recordingId)
    .maybeSingle();

  const recording: PocketRecordingSummary = {
    id: recordingId,
    title: pendingRes.data?.recording_title as string | null | undefined,
    created_at: (pendingRes.data?.recording_created_at ??
      pendingRes.data?.transcription_completed_at) as string | null | undefined,
  };

  if (recording.created_at) {
    const connectedAt = new Date(integrationRes.data.connected_at as string);
    const createdMs = new Date(recording.created_at).getTime();
    if (!Number.isNaN(createdMs) && createdMs < connectedAt.getTime()) {
      return { status: "skipped", reason: "before connect date" };
    }
  }

  const ambiguityRes = await service
    .from("pocket_speaker_ambiguities")
    .select("transcript_segments")
    .eq("owner_id", ownerId)
    .eq("recording_id", recordingId)
    .is("resolved_at", null)
    .maybeSingle();

  return importRecording(
    service,
    supabaseUrl,
    serviceRoleKey,
    ownerId,
    recording,
    tokenRes.data.access_token as string,
    integrationRes.data.account_display_name as string,
    {
      userSpeakerOverride,
      transcript: ambiguityRes.data?.transcript_segments ?? undefined,
    },
  );
}
