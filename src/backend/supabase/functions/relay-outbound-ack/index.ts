// relay-outbound-ack Edge Function — Mac relay reports send success/failure
// for queued outbound messages. Device auth required.
//
// Deploy:
//   supabase functions deploy relay-outbound-ack --no-verify-jwt
//
// deno-lint-ignore-file no-explicit-any

import {
  createAdminClient,
  jsonResponse,
  RELAY_CORS_HEADERS,
  verifyRelayDevice,
} from "../_shared/relayAuth.ts";

interface AckRequest {
  id: string;
  status: "sent" | "failed";
  externalMessageId?: string;
  externalChatId?: string;
  error?: string;
  sentAt?: string;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: RELAY_CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  const adminClient = createAdminClient();
  const auth = await verifyRelayDevice(req, adminClient);
  if (auth instanceof Response) return auth;

  let body: AckRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid JSON body" });
  }

  if (!body.id || (body.status !== "sent" && body.status !== "failed")) {
    return jsonResponse(400, { error: "missing id or invalid status" });
  }
  if (body.status === "sent" && !body.externalMessageId) {
    return jsonResponse(400, { error: "externalMessageId required when sent" });
  }

  const { data: queueRow, error: fetchError } = await adminClient
    .from("outbound_queue")
    .select("id, thread_id, contact_id, group_id, body, status")
    .eq("id", body.id)
    .eq("owner_id", auth.ownerId)
    .maybeSingle();

  if (fetchError) {
    return jsonResponse(500, { error: fetchError.message });
  }
  if (!queueRow) {
    return jsonResponse(404, { error: "queue item not found" });
  }
  if (queueRow.status !== "pending") {
    return jsonResponse(409, { error: "queue item already processed" });
  }

  const sentAt = body.sentAt ?? new Date().toISOString();
  const update =
    body.status === "sent"
      ? { status: "sent", sent_at: sentAt, error: null }
      : { status: "failed", error: body.error ?? "send failed" };

  const { error: updateError } = await adminClient
    .from("outbound_queue")
    .update(update)
    .eq("id", body.id)
    .eq("owner_id", auth.ownerId)
    .eq("status", "pending");

  if (updateError) {
    return jsonResponse(500, { error: updateError.message });
  }

  if (body.status === "sent") {
    let threadId = queueRow.thread_id as string | null;

    if (!threadId && body.externalChatId) {
      const { data: thread, error: threadError } = await adminClient
        .from("message_threads")
        .upsert(
          {
            owner_id: auth.ownerId,
            external_chat_id: body.externalChatId,
            contact_id: queueRow.contact_id,
            group_id: queueRow.group_id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "owner_id,external_chat_id" },
        )
        .select("id")
        .single();

      if (threadError) {
        return jsonResponse(500, { error: threadError.message });
      }
      threadId = thread.id;
    }

    if (!threadId) {
      return jsonResponse(400, { error: "queue item has no thread_id" });
    }

    const { error: messageError } = await adminClient.from("messages").insert({
      owner_id: auth.ownerId,
      thread_id: threadId,
      external_message_id: body.externalMessageId,
      direction: "outbound",
      body: queueRow.body,
      sent_at: sentAt,
    });

    if (messageError && messageError.code !== "23505") {
      return jsonResponse(500, { error: messageError.message });
    }
  }

  return jsonResponse(200, { ok: true });
}

if (import.meta.main) {
  Deno.serve(handler);
}
