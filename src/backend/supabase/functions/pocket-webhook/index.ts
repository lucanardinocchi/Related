// pocket-webhook — receive Pocket transcription.completed events, queue import
// for 15 minutes later (Extraction Pass runs when processed).
//
// Deploy:
//   supabase functions deploy pocket-webhook
//
// Users configure a personal webhook in Pocket pointing at this URL and paste
// the signing secret into Related Settings when connecting Pocket.
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { IMPORT_DELAY_MS } from "../_shared/pocketImport.ts";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, content-type, x-heypocket-signature, x-heypocket-timestamp",
  "access-control-allow-methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

interface WebhookPayload {
  event?: string;
  timestamp?: string;
  user?: { id?: string; email?: string };
  recording?: {
    id?: string;
    title?: string;
    createdAt?: string;
  };
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

async function verifySignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

async function resolveOwnerId(
  service: ReturnType<typeof createClient>,
  user: { id?: string; email?: string },
): Promise<string | null> {
  if (user.id) {
    const byId = await service
      .from("pocket_integration")
      .select("owner_id")
      .eq("pocket_user_id", user.id)
      .maybeSingle();
    if (byId.data?.owner_id) return byId.data.owner_id as string;
  }
  const email = user.email?.toLowerCase();
  if (email) {
    const byEmail = await service
      .from("pocket_integration")
      .select("owner_id")
      .eq("pocket_user_email", email)
      .maybeSingle();
    if (byEmail.data?.owner_id) return byEmail.data.owner_id as string;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  const rawBody = await req.text();
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return jsonResponse(400, { error: "invalid JSON" });
  }

  if (payload.event !== "transcription.completed") {
    return jsonResponse(200, { status: "ignored", event: payload.event ?? null });
  }

  const recordingId = payload.recording?.id;
  const user = payload.user ?? {};
  if (!recordingId || (!user.id && !user.email)) {
    return jsonResponse(400, { error: "missing recording or user" });
  }

  const service = createClient(SUPABASE_URL ?? "", SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });

  const ownerId = await resolveOwnerId(service, user);
  if (!ownerId) {
    return jsonResponse(404, { error: "no matching Pocket integration" });
  }

  const integrationRes = await service
    .from("pocket_integration")
    .select("webhook_secret, connected_at")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!integrationRes.data) {
    return jsonResponse(404, { error: "integration not found" });
  }

  const secret = integrationRes.data.webhook_secret as string | null;
  if (secret) {
    const signature = req.headers.get("X-HeyPocket-Signature") ?? "";
    const timestamp = req.headers.get("X-HeyPocket-Timestamp") ?? "";
    if (!signature || !timestamp) {
      return jsonResponse(401, { error: "missing signature headers" });
    }
    const valid = await verifySignature(secret, timestamp, rawBody, signature);
    if (!valid) {
      return jsonResponse(401, { error: "invalid signature" });
    }
  }

  const importedRes = await service
    .from("pocket_imports")
    .select("recording_id")
    .eq("owner_id", ownerId)
    .eq("recording_id", recordingId)
    .maybeSingle();
  if (importedRes.data) {
    return jsonResponse(200, { status: "already_imported" });
  }

  const recordingCreatedAt = payload.recording?.createdAt ?? null;
  const connectedAt = new Date(integrationRes.data.connected_at as string);
  if (recordingCreatedAt) {
    const createdMs = new Date(recordingCreatedAt).getTime();
    if (!Number.isNaN(createdMs) && createdMs < connectedAt.getTime()) {
      return jsonResponse(200, { status: "ignored", reason: "before connect" });
    }
  }

  const completedAt = payload.timestamp
    ? new Date(payload.timestamp)
    : new Date();
  const processAt = new Date(completedAt.getTime() + IMPORT_DELAY_MS);

  const { error } = await service.from("pocket_pending_imports").upsert(
    {
      owner_id: ownerId,
      recording_id: recordingId,
      recording_title: payload.recording?.title ?? null,
      recording_created_at: recordingCreatedAt,
      transcription_completed_at: completedAt.toISOString(),
      process_at: processAt.toISOString(),
      status: "pending",
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,recording_id" },
  );
  if (error) {
    return jsonResponse(500, { error: error.message });
  }

  return jsonResponse(200, {
    status: "queued",
    recordingId,
    processAt: processAt.toISOString(),
  });
});
