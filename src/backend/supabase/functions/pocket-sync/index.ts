// pocket-sync Edge Function — manual backfill sync + speaker ambiguity resolution.
// Automatic imports use pocket-webhook → pocket-process-pending (15 min delay).
//
// Deploy:
//   supabase functions deploy pocket-sync
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import {
  importRecording,
  pocketFetch,
  processPendingImportForOwner,
  type PocketRecordingSummary,
  type PocketSpeakerAssignmentPayload,
} from "../_shared/pocketImport.ts";
import { formatUtcDate } from "../../../../shared/src/integrations/pocket/pocketSpeakerMatch.ts";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface SyncSummary {
  imported: number;
  extracted: number;
  skippedAlreadyImported: number;
  ambiguitiesCreated: number;
  ambiguitiesPending: number;
  errors: string[];
}

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

async function listAllRecordings(
  apiKey: string,
  startDate: string,
): Promise<PocketRecordingSummary[]> {
  const out: PocketRecordingSummary[] = [];
  let page = 1;
  for (;;) {
    const json = await pocketFetch<{
      data?: PocketRecordingSummary[];
      pagination?: { has_more?: boolean };
    }>(apiKey, "/recordings", {
      start_date: startDate,
      page: String(page),
      limit: "100",
    });
    out.push(...(json.data ?? []));
    if (!json.pagination?.has_more) break;
    page += 1;
    if (page > 100) break;
  }
  return out;
}

async function runSync(
  service: ReturnType<typeof createClient>,
  ownerId: string,
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    imported: 0,
    extracted: 0,
    skippedAlreadyImported: 0,
    ambiguitiesCreated: 0,
    ambiguitiesPending: 0,
    errors: [],
  };

  const tokenRes = await service
    .from("user_provider_tokens")
    .select("access_token")
    .eq("owner_id", ownerId)
    .eq("provider", "pocket")
    .maybeSingle();
  if (!tokenRes.data?.access_token) {
    throw new Error("Pocket is not connected");
  }
  const apiKey = tokenRes.data.access_token as string;

  const integrationRes = await service
    .from("pocket_integration")
    .select("account_display_name, connected_at")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!integrationRes.data) {
    throw new Error("Pocket integration metadata missing — reconnect Pocket");
  }
  const accountDisplayName = integrationRes.data.account_display_name as string;
  const connectedAt = new Date(integrationRes.data.connected_at as string);
  const startDate = formatUtcDate(connectedAt);
  const connectedAtMs = connectedAt.getTime();

  const importedRes = await service
    .from("pocket_imports")
    .select("recording_id")
    .eq("owner_id", ownerId);
  const importedIds = new Set(
    ((importedRes.data ?? []) as Array<{ recording_id: string }>).map(
      (r) => r.recording_id,
    ),
  );

  const recordings = await listAllRecordings(apiKey, startDate);

  for (const recording of recordings) {
    if (importedIds.has(recording.id)) {
      summary.skippedAlreadyImported += 1;
      continue;
    }
    if (recording.created_at) {
      const createdMs = new Date(recording.created_at).getTime();
      if (!Number.isNaN(createdMs) && createdMs < connectedAtMs) continue;
    }
    try {
      const result = await importRecording(
        service,
        SUPABASE_URL,
        SERVICE_ROLE_KEY,
        ownerId,
        recording,
        apiKey,
        accountDisplayName,
      );
      if (result.status === "imported") {
        summary.imported += 1;
        summary.extracted += 1;
        importedIds.add(recording.id);
      } else if (result.status === "ambiguous") {
        summary.ambiguitiesCreated += 1;
      }
    } catch (err) {
      summary.errors.push(
        `${recording.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const pendingRes = await service
    .from("pocket_speaker_ambiguities")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .is("resolved_at", null);
  summary.ambiguitiesPending = pendingRes.count ?? 0;

  await service
    .from("pocket_integration")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("owner_id", ownerId);

  return summary;
}

async function loadContactNamesById(
  service: ReturnType<typeof createClient>,
  ownerId: string,
  contactIds: string[],
): Promise<Record<string, string>> {
  if (contactIds.length === 0) return {};
  const { data, error } = await service
    .from("contacts")
    .select("id, name")
    .eq("owner_id", ownerId)
    .in("id", contactIds);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as Array<{ id: string; name: string }>) {
    out[row.id] = row.name;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "missing Authorization header" });
  }

  let body: {
    action?: string;
    recordingId?: string;
    speaker?: string;
    assignments?: Record<string, PocketSpeakerAssignmentPayload>;
  };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    return jsonResponse(400, { error: "invalid JSON body" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const userRes = await supabase.auth.getUser();
  if (userRes.error || !userRes.data.user) {
    return jsonResponse(401, { error: "auth failed" });
  }
  const ownerId = userRes.data.user.id;
  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  if (body.action === "resolveSpeakers") {
    const recordingId = body.recordingId?.trim();
    const assignments = body.assignments;
    if (!recordingId || !assignments || typeof assignments !== "object") {
      return jsonResponse(400, { error: "missing recordingId or assignments" });
    }

    const selfCount = Object.values(assignments).filter((a) =>
      a?.kind === "self"
    ).length;
    if (selfCount !== 1) {
      return jsonResponse(400, {
        error: "assign exactly one speaker as yourself",
      });
    }

    const ambiguityRes = await supabase
      .from("pocket_speaker_ambiguities")
      .select(
        "speakers, recording_title, recording_created_at, transcript_segments",
      )
      .eq("recording_id", recordingId)
      .is("resolved_at", null)
      .maybeSingle();
    if (ambiguityRes.error || !ambiguityRes.data) {
      return jsonResponse(404, { error: "ambiguity not found" });
    }

    const storedTranscript = ambiguityRes.data.transcript_segments;
    const hasStoredTranscript = Array.isArray(storedTranscript) &&
      storedTranscript.length > 0;

    const integrationRes = await service
      .from("pocket_integration")
      .select("account_display_name")
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (!integrationRes.data) {
      return jsonResponse(400, { error: "Pocket integration metadata missing" });
    }

    let pocketApiKey = "";
    if (!hasStoredTranscript) {
      const tokenRes = await service
        .from("user_provider_tokens")
        .select("access_token")
        .eq("owner_id", ownerId)
        .eq("provider", "pocket")
        .maybeSingle();
      if (!tokenRes.data?.access_token) {
        return jsonResponse(400, { error: "Pocket is not connected" });
      }
      pocketApiKey = tokenRes.data.access_token as string;
    } else {
      const tokenRes = await service
        .from("user_provider_tokens")
        .select("access_token")
        .eq("owner_id", ownerId)
        .eq("provider", "pocket")
        .maybeSingle();
      pocketApiKey = (tokenRes.data?.access_token as string) ?? "";
    }

    const contactIds = Object.values(assignments)
      .filter((a): a is { kind: "contact"; contactId: string } =>
        a?.kind === "contact" && typeof a.contactId === "string"
      )
      .map((a) => a.contactId);

    try {
      const contactNamesById = await loadContactNamesById(
        service,
        ownerId,
        contactIds,
      );
      if (contactIds.some((id) => !contactNamesById[id])) {
        return jsonResponse(400, { error: "unknown contact in assignments" });
      }

      const recording: PocketRecordingSummary = {
        id: recordingId,
        title: ambiguityRes.data.recording_title as string | null,
        created_at: ambiguityRes.data.recording_created_at as string | null,
      };

      const result = await importRecording(
        service,
        SUPABASE_URL,
        SERVICE_ROLE_KEY,
        ownerId,
        recording,
        pocketApiKey,
        integrationRes.data.account_display_name as string,
        {
          speakerAssignments: assignments,
          contactNamesById,
          transcript: hasStoredTranscript ? storedTranscript : undefined,
        },
      );

      if (result.status === "imported") {
        await supabase
          .from("pocket_speaker_ambiguities")
          .update({
            resolved_at: new Date().toISOString(),
            resolved_speaker: Object.entries(assignments).find(([, a]) =>
              a.kind === "self"
            )?.[0] ?? null,
          })
          .eq("recording_id", recordingId);
        return jsonResponse(200, { status: "ok", chatId: result.chatId });
      }
      return jsonResponse(500, {
        error: `import failed: ${result.status}`,
      });
    } catch (err) {
      return jsonResponse(500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (body.action === "resolveSpeaker") {
    const recordingId = body.recordingId?.trim();
    const speaker = body.speaker?.trim();
    if (!recordingId || !speaker) {
      return jsonResponse(400, { error: "missing recordingId or speaker" });
    }

    const ambiguityRes = await supabase
      .from("pocket_speaker_ambiguities")
      .select("speakers")
      .eq("recording_id", recordingId)
      .is("resolved_at", null)
      .maybeSingle();
    if (ambiguityRes.error || !ambiguityRes.data) {
      return jsonResponse(404, { error: "ambiguity not found" });
    }
    if (!(ambiguityRes.data.speakers as string[]).includes(speaker)) {
      return jsonResponse(400, { error: "speaker not in ambiguity list" });
    }

    try {
      const result = await processPendingImportForOwner(
        service,
        SUPABASE_URL,
        SERVICE_ROLE_KEY,
        ownerId,
        recordingId,
        speaker,
      );
      if (result.status === "imported") {
        await supabase
          .from("pocket_speaker_ambiguities")
          .update({
            resolved_at: new Date().toISOString(),
            resolved_speaker: speaker,
          })
          .eq("recording_id", recordingId);
        return jsonResponse(200, { status: "ok", chatId: result.chatId });
      }
      return jsonResponse(500, {
        error: `import failed: ${result.status}`,
      });
    } catch (err) {
      return jsonResponse(500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  try {
    const summary = await runSync(service, ownerId);
    return jsonResponse(200, { status: "ok", ...summary });
  } catch (err) {
    return jsonResponse(500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
