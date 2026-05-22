// pocket-process-pending — import a queued Pocket recording and run
// Extraction Pass. Invoked by pg_cron 15+ minutes after transcription.completed.
//
// Deploy:
//   supabase functions deploy pocket-process-pending
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { processPendingImportForOwner } from "../_shared/pocketImport.ts";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  let body: { ownerId?: string; recordingId?: string; drain?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid JSON body" });
  }

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  if (body.drain) {
    const due = await service
      .from("pocket_pending_imports")
      .select("owner_id, recording_id")
      .eq("status", "pending")
      .lte("process_at", new Date().toISOString())
      .order("process_at", { ascending: true })
      .limit(50);
    const results: Array<Record<string, unknown>> = [];
    for (const row of due.data ?? []) {
      const res = await processOne(
        service,
        row.owner_id as string,
        row.recording_id as string,
      );
      results.push(res);
    }
    return jsonResponse(200, { status: "ok", processed: results.length, results });
  }

  const ownerId = body.ownerId;
  const recordingId = body.recordingId;
  if (!ownerId || !recordingId) {
    return jsonResponse(400, { error: "missing ownerId or recordingId" });
  }

  const result = await processOne(service, ownerId, recordingId);
  return jsonResponse(200, result);
});

async function processOne(
  service: ReturnType<typeof createClient>,
  ownerId: string,
  recordingId: string,
): Promise<Record<string, unknown>> {
  const claim = await service
    .from("pocket_pending_imports")
    .update({
      status: "processing",
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", ownerId)
    .eq("recording_id", recordingId)
    .eq("status", "pending")
    .select("recording_id")
    .maybeSingle();

  if (!claim.data) {
    return { ownerId, recordingId, status: "not_pending" };
  }

  try {
    const result = await processPendingImportForOwner(
      service,
      SUPABASE_URL,
      SERVICE_ROLE_KEY,
      ownerId,
      recordingId,
    );

    if (result.status === "already_imported") {
      await service
        .from("pocket_pending_imports")
        .update({
          status: "done",
          updated_at: new Date().toISOString(),
        })
        .eq("owner_id", ownerId)
        .eq("recording_id", recordingId);
      return { ownerId, recordingId, status: "already_imported" };
    }

    if (result.status === "skipped") {
      await service
        .from("pocket_pending_imports")
        .update({
          status: "skipped",
          last_error: result.reason,
          updated_at: new Date().toISOString(),
        })
        .eq("owner_id", ownerId)
        .eq("recording_id", recordingId);
      return { ownerId, recordingId, status: "skipped", reason: result.reason };
    }

    if (result.status === "ambiguous") {
      await service
        .from("pocket_pending_imports")
        .update({
          status: "done",
          last_error: "speaker ambiguity — resolve in Settings",
          updated_at: new Date().toISOString(),
        })
        .eq("owner_id", ownerId)
        .eq("recording_id", recordingId);
      return { ownerId, recordingId, status: "ambiguous" };
    }

    await service
      .from("pocket_integration")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("owner_id", ownerId);

    await service
      .from("pocket_pending_imports")
      .update({
        status: "done",
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", ownerId)
      .eq("recording_id", recordingId);

    return {
      ownerId,
      recordingId,
      status: "imported",
      chatId: result.chatId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await service
      .from("pocket_pending_imports")
      .update({
        status: "failed",
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", ownerId)
      .eq("recording_id", recordingId);
    return { ownerId, recordingId, status: "failed", error: message };
  }
}
