// instagram-webhook — Meta webhook verification + inbound Instagram DM storage.
//
// Deploy:
//   supabase secrets set INSTAGRAM_VERIFY_TOKEN=...
//   supabase functions deploy instagram-webhook --no-verify-jwt
//
// Meta App Dashboard → Webhooks:
//   Callback URL: https://<ref>.supabase.co/functions/v1/instagram-webhook
//   Verify token: same as INSTAGRAM_VERIFY_TOKEN
//   Subscribe to: messages (Instagram object)
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import {
  findContactByScopedId,
  findOwnerIdForInstagramAccount,
  linkContactScopedId,
  upsertInstagramMessage,
} from "../_shared/instagramMessages.ts";
import { verifyMetaSignature } from "../_shared/metaWebhookSignature.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const VERIFY_TOKEN = Deno.env.get("INSTAGRAM_VERIFY_TOKEN");
const APP_SECRET = Deno.env.get("INSTAGRAM_APP_SECRET");

interface MessagingEvent {
  sender?: { id?: string; username?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
  };
}

async function handleMessagingEvent(
  supabase: any,
  accountId: string,
  event: MessagingEvent,
): Promise<void> {
  const mid = event.message?.mid;
  const text = event.message?.text;
  if (!mid || !text?.trim()) return;

  const ownerId = await findOwnerIdForInstagramAccount(supabase, accountId);
  if (!ownerId) return;

  const senderId = event.sender?.id ?? null;
  const recipientId = event.recipient?.id ?? null;
  const isEcho = event.message?.is_echo === true;

  const ourAccountId = accountId;
  const contactScopedId = isEcho
    ? recipientId
    : senderId === ourAccountId
      ? recipientId
      : senderId;

  if (!contactScopedId || contactScopedId === ourAccountId) return;

  let contact = await findContactByScopedId(supabase, ownerId, contactScopedId);

  if (!contact) {
    const { data: candidates } = await supabase
      .from("contacts")
      .select("id, instagram_username, instagram_scoped_id")
      .eq("owner_id", ownerId)
      .not("instagram_username", "is", null)
      .limit(50);

    if (candidates?.length === 1) {
      contact = {
        id: candidates[0].id as string,
        instagram_username: candidates[0].instagram_username as string | null,
      };
      await linkContactScopedId(supabase, ownerId, contact.id, contactScopedId);
    } else {
      return;
    }
  }

  const ts = event.timestamp ?? Date.now();
  const sentAt = new Date(ts > 1e12 ? ts : ts * 1000).toISOString();

  await upsertInstagramMessage(supabase, {
    ownerId,
    contactId: contact!.id,
    message: {
      ig_message_id: mid,
      direction: isEcho ? "outbound" : "inbound",
      from_username: event.sender?.username ?? contact!.instagram_username,
      from_scoped_id: isEcho ? ourAccountId : contactScopedId,
      text: text.trim(),
      sent_at: sentAt,
    },
  });
}

async function handleWebhookPayload(
  supabase: any,
  payload: Record<string, unknown>,
): Promise<void> {
  const object = payload.object as string | undefined;
  if (object !== "instagram" && object !== "page") return;

  const entries = (payload.entry ?? []) as Array<Record<string, unknown>>;
  for (const entry of entries) {
    const accountId = String(entry.id ?? "");
    if (!accountId) continue;

    const messaging = (entry.messaging ?? []) as MessagingEvent[];
    for (const event of messaging) {
      await handleMessagingEvent(supabase, accountId, event);
    }

    const changes = (entry.changes ?? []) as Array<{
      field?: string;
      value?: { messaging?: MessagingEvent[] };
    }>;
    for (const change of changes) {
      if (change.field !== "messages") continue;
      const nested = change.value?.messaging ?? [];
      for (const event of nested) {
        await handleMessagingEvent(supabase, accountId, event);
      }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (
      mode === "subscribe" &&
      token === VERIFY_TOKEN &&
      challenge
    ) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const sig = await verifyMetaSignature({
    rawBody,
    signatureHeader: req.headers.get("x-hub-signature-256"),
    appSecret: APP_SECRET,
    provider: "instagram",
  });
  if (!sig.ok) {
    return new Response(sig.reason, { status: sig.status });
  }

  const adminClient = createClient(
    SUPABASE_URL ?? "",
    SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    await handleWebhookPayload(adminClient, payload);
    return new Response("OK", { status: 200 });
  } catch {
    return new Response("OK", { status: 200 });
  }
});
