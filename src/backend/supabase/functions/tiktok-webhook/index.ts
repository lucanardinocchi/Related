// tiktok-webhook Edge Function — receive inbound TikTok Business Messaging
// events and persist to tiktok_messages.
//
// Deploy:
//   supabase secrets set TIKTOK_CLIENT_KEY=...
//   supabase functions deploy tiktok-webhook
//
// Register callback URL in TikTok Developer Portal:
//   https://<project-ref>.supabase.co/functions/v1/tiktok-webhook
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const CLIENT_KEY = Deno.env.get("TIKTOK_CLIENT_KEY");

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function findOwnerForOpenId(
  supabase: any,
  businessOpenId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("user_provider_tokens")
    .select("owner_id")
    .eq("provider", "tiktok")
    .eq("provider_account_id", businessOpenId)
    .maybeSingle();
  return (data?.owner_id as string) ?? null;
}

async function findContactForParticipant(
  supabase: any,
  ownerId: string,
  participantOpenId: string,
  participantUsername: string | null,
): Promise<string | null> {
  const { data: byOpenId } = await supabase
    .from("contacts")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("tiktok_open_id", participantOpenId)
    .maybeSingle();
  if (byOpenId?.id) return byOpenId.id as string;

  if (participantUsername) {
    const normalized = participantUsername.replace(/^@/, "").toLowerCase();
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, tiktok_username")
      .eq("owner_id", ownerId)
      .not("tiktok_username", "is", null);

    for (const c of contacts ?? []) {
      const handle = (c.tiktok_username as string)
        .trim()
        .replace(/^@/, "")
        .toLowerCase();
      if (handle === normalized) {
        await supabase
          .from("contacts")
          .update({
            tiktok_open_id: participantOpenId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", c.id);
        return c.id as string;
      }
    }
  }

  return null;
}

async function findGroupForConversation(
  supabase: any,
  ownerId: string,
  conversationId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("groups")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("tiktok_dm_conversation_id", conversationId)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

Deno.serve(async (req) => {
  // GET handshake. TikTok's docs across product surfaces are inconsistent
  // about whether a verification challenge is sent; we mirror the Meta pattern
  // and safely echo any `challenge` query param so re-registration just works.
  // If no challenge is present we still 200 OK (rather than 405) because some
  // TikTok surfaces health-check the URL with a bare GET.
  if (req.method === "GET") {
    const url = new URL(req.url);
    const challenge = url.searchParams.get("challenge");
    if (challenge) {
      return new Response(challenge, {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }
    return new Response("OK", { status: 200 });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }

  // Tighten client_key validation: if TIKTOK_CLIENT_KEY is set, the payload
  // MUST include a matching client_key. If the secret is unset we warn and
  // accept (local dev). Mirrors the Meta APP_SECRET behaviour.
  const clientKey = payload.client_key as string | undefined;
  if (CLIENT_KEY) {
    if (!clientKey || clientKey !== CLIENT_KEY) {
      return jsonResponse({ error: "invalid client_key" }, 401);
    }
  } else {
    console.warn(
      "[tiktok-webhook] TIKTOK_CLIENT_KEY not set — accepting webhook without client_key check. " +
        "This is INSECURE. Set the secret in production.",
    );
  }

  const event = payload.event as string | undefined;
  const contentRaw = payload.content as string | undefined;

  if (!event || !contentRaw) {
    return jsonResponse({ ok: true });
  }

  let content: Record<string, unknown>;
  try {
    content = JSON.parse(contentRaw);
  } catch {
    return jsonResponse({ ok: true });
  }

  const messageEvents = [
    "im.message.receive",
    "im_receive_msg",
    "direct_message.receive",
  ];
  if (!messageEvents.some((e) => event.includes(e) || event === e)) {
    return jsonResponse({ ok: true });
  }

  const adminClient = createClient(
    SUPABASE_URL ?? "",
    SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false } },
  );

  const businessOpenId =
    (payload.user_openid as string) ??
    (content.to_user_id as string) ??
    (content.business_open_id as string);
  const senderOpenId =
    (content.from_user_id as string) ??
    (content.sender_id as string) ??
    (content.from_open_id as string);
  const senderUsername =
    (content.from_username as string) ??
    (content.sender_username as string) ??
    null;
  const messageId = String(
    content.message_id ?? content.id ?? crypto.randomUUID(),
  );
  const text = String(
    content.text ?? content.content ?? content.body ?? "",
  );
  const conversationId = String(
    content.conversation_id ?? content.conversationId ?? "",
  );
  const createTime = content.create_time as number | undefined;
  const sentAt = createTime
    ? new Date(createTime * 1000).toISOString()
    : new Date().toISOString();

  if (!businessOpenId || !senderOpenId) {
    return jsonResponse({ ok: true });
  }

  const ownerId = await findOwnerForOpenId(adminClient, businessOpenId);
  if (!ownerId) {
    return jsonResponse({ ok: true });
  }

  const isInbound = senderOpenId !== businessOpenId;
  let contactId: string | null = null;
  let groupId: string | null = null;

  if (isInbound) {
    contactId = await findContactForParticipant(
      adminClient,
      ownerId,
      senderOpenId,
      senderUsername,
    );
  }

  if (conversationId) {
    groupId = await findGroupForConversation(
      adminClient,
      ownerId,
      conversationId,
    );
    if (groupId) contactId = null;
  }

  if (!contactId && !groupId && isInbound) {
    contactId = await findContactForParticipant(
      adminClient,
      ownerId,
      senderOpenId,
      senderUsername,
    );
  }

  await adminClient.from("tiktok_messages").upsert(
    {
      owner_id: ownerId,
      contact_id: contactId,
      group_id: groupId,
      tiktok_message_id: messageId,
      direction: isInbound ? "inbound" : "outbound",
      from_username: senderUsername,
      text,
      sent_at: sentAt,
      tiktok_conversation_id: conversationId || null,
    },
    { onConflict: "owner_id,tiktok_message_id" },
  );

  return jsonResponse({ ok: true });
});
