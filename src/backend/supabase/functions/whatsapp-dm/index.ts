// whatsapp-dm Edge Function — list and send WhatsApp DMs for Contacts and Groups.
//
// Messages are stored in whatsapp_messages (inbound via whatsapp-webhook,
// outbound on send). List reads from that table.
//
// Deploy:
//   supabase secrets set WHATSAPP_APP_ID=...
//   supabase secrets set WHATSAPP_APP_SECRET=...
//   supabase functions deploy whatsapp-dm
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const GRAPH_API = "https://graph.facebook.com/v21.0";
const WHATSAPP_SCOPE_BUSINESS_MANAGEMENT = "whatsapp_business_management";
const WHATSAPP_SCOPE_BUSINESS_MESSAGING = "whatsapp_business_messaging";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

interface WhatsAppMessageSummary {
  id: string;
  text: string;
  fromPhone: string | null;
  fromName: string | null;
  sentAt: string;
  direction: "sent" | "received";
}

interface TokenRow {
  owner_id: string;
  access_token: string;
  refresh_token: string | null;
  scopes: string | null;
  provider_account_id: string | null;
  expires_at: string | null;
}

interface MessageRow {
  id: string;
  wa_message_id: string;
  direction: "inbound" | "outbound";
  from_phone: string | null;
  from_name: string | null;
  text: string;
  sent_at: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const APP_ID = Deno.env.get("WHATSAPP_APP_ID");
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET");

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

function hasWhatsAppScopes(scopes: string | null): boolean {
  if (!scopes) return false;
  return (
    scopes.includes(WHATSAPP_SCOPE_BUSINESS_MESSAGING) &&
    (scopes.includes(WHATSAPP_SCOPE_BUSINESS_MANAGEMENT) ||
      scopes.includes("business_management"))
  );
}

function normalizeWaId(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.trim().replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function normalizePhoneDigits(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function mapMessageRow(row: MessageRow): WhatsAppMessageSummary {
  return {
    id: row.wa_message_id,
    text: row.text,
    fromPhone: row.from_phone,
    fromName: row.from_name,
    sentAt: row.sent_at,
    direction: row.direction === "outbound" ? "sent" : "received",
  };
}

async function refreshAccessToken(
  accessToken: string,
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: APP_ID ?? "",
    client_secret: APP_SECRET ?? "",
    fb_exchange_token: accessToken,
  });
  const response = await fetch(
    `${GRAPH_API}/oauth/access_token?${params.toString()}`,
  );
  if (!response.ok) {
    throw new Error("needs_reconsent");
  }
  const data = await response.json();
  if (!data.access_token) {
    throw new Error("needs_reconsent");
  }
  return {
    accessToken: data.access_token as string,
    expiresInSeconds: data.expires_in ?? 60 * 24 * 60 * 60,
  };
}

async function persistRefreshedToken(
  supabase: any,
  ownerId: string,
  accessToken: string,
  expiresInSeconds: number,
): Promise<void> {
  const newExpires = new Date(
    Date.now() + expiresInSeconds * 1000,
  ).toISOString();
  await supabase
    .from("user_provider_tokens")
    .update({
      access_token: accessToken,
      expires_at: newExpires,
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", ownerId)
    .eq("provider", "whatsapp");
}

async function waFetch(
  supabase: any,
  tokenRow: TokenRow,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  let accessToken = tokenRow.access_token;
  let response = await fetch(`${GRAPH_API}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (response.status !== 401 && response.status !== 403) {
    return response;
  }

  const refresh = await refreshAccessToken(accessToken);
  accessToken = refresh.accessToken;
  await persistRefreshedToken(
    supabase,
    tokenRow.owner_id,
    accessToken,
    refresh.expiresInSeconds,
  );

  return fetch(`${GRAPH_API}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
}

async function listMessagesForContact(
  supabase: any,
  ownerId: string,
  input: {
    contactId: string;
    phone?: string | null;
    whatsappWaId?: string | null;
    maxResults?: number;
  },
): Promise<{ messages: WhatsAppMessageSummary[]; resolvedWaId: string | null }> {
  let waId = normalizeWaId(input.whatsappWaId);
  if (!waId && input.phone) {
    waId = normalizeWaId(input.phone);
  }

  const limit = Math.min(input.maxResults ?? 25, 100);
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select(
      "id, wa_message_id, direction, from_phone, from_name, text, sent_at",
    )
    .eq("owner_id", ownerId)
    .eq("contact_id", input.contactId)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as MessageRow[];
  const messages = rows
    .map(mapMessageRow)
    .sort(
      (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
    );

  return { messages, resolvedWaId: waId };
}

async function listMessagesForGroup(
  supabase: any,
  ownerId: string,
  input: {
    groupId: string;
    whatsappGroupId?: string | null;
    memberPhones?: string[];
    maxResults?: number;
  },
): Promise<{ messages: WhatsAppMessageSummary[]; resolvedGroupId: string | null }> {
  let groupId = input.whatsappGroupId?.trim() || null;

  if (!groupId && input.memberPhones && input.memberPhones.length > 0) {
    groupId = await findGroupWhatsAppId(
      supabase,
      ownerId,
      input.memberPhones,
    );
  }

  const limit = Math.min(input.maxResults ?? 25, 100);
  let query = supabase
    .from("whatsapp_messages")
    .select(
      "id, wa_message_id, direction, from_phone, from_name, text, sent_at",
    )
    .eq("owner_id", ownerId)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (groupId) {
    query = query.or(
      `group_id.eq.${input.groupId},whatsapp_group_id.eq.${groupId}`,
    );
  } else {
    query = query.eq("group_id", input.groupId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as MessageRow[];
  const messages = rows
    .map(mapMessageRow)
    .sort(
      (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
    );

  return { messages, resolvedGroupId: groupId };
}

async function findGroupWhatsAppId(
  supabase: any,
  ownerId: string,
  memberPhones: string[],
): Promise<string | null> {
  const memberDigits = new Set(
    memberPhones.map(normalizePhoneDigits).filter(Boolean),
  );
  if (memberDigits.size === 0) return null;

  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("whatsapp_group_id, from_phone")
    .eq("owner_id", ownerId)
    .not("whatsapp_group_id", "is", null);

  if (error || !data) return null;

  const counts = new Map<string, number>();
  for (const row of data as Array<{
    whatsapp_group_id: string | null;
    from_phone: string | null;
  }>) {
    const groupId = row.whatsapp_group_id;
    const fromDigits = normalizePhoneDigits(row.from_phone);
    if (!groupId || !memberDigits.has(fromDigits)) continue;
    counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestScore = 0;
  for (const [groupId, score] of counts) {
    if (score > bestScore) {
      bestScore = score;
      best = groupId;
    }
  }

  return bestScore > 0 ? best : null;
}

async function sendDirectMessage(
  supabase: any,
  tokenRow: TokenRow,
  ownerId: string,
  input: {
    contactId: string;
    whatsappWaId: string;
    text: string;
  },
): Promise<string> {
  const phoneNumberId = tokenRow.provider_account_id;
  if (!phoneNumberId) {
    throw new Error("WhatsApp phone number ID missing — reconnect in Settings.");
  }

  const response = await waFetch(
    supabase,
    tokenRow,
    `/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.whatsappWaId,
        type: "text",
        text: { body: input.text },
      }),
    },
  );

  if (response.status === 401 || response.status === 403) {
    throw new Error("needs_reconsent");
  }
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `WhatsApp send failed (${response.status}): ${errText.slice(0, 200)}`,
    );
  }

  const data = await response.json();
  const messageId = (data.messages?.[0]?.id as string) ?? "";

  await supabase.from("whatsapp_messages").upsert(
    {
      owner_id: ownerId,
      contact_id: input.contactId,
      wa_message_id: messageId || crypto.randomUUID(),
      direction: "outbound",
      from_phone: null,
      from_name: null,
      text: input.text,
      sent_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,wa_message_id" },
  );

  return messageId;
}

async function sendGroupMessage(
  supabase: any,
  tokenRow: TokenRow,
  ownerId: string,
  input: {
    groupId: string;
    whatsappGroupId: string;
    text: string;
  },
): Promise<string> {
  const phoneNumberId = tokenRow.provider_account_id;
  if (!phoneNumberId) {
    throw new Error("WhatsApp phone number ID missing — reconnect in Settings.");
  }

  const response = await waFetch(
    supabase,
    tokenRow,
    `/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "group",
        to: input.whatsappGroupId,
        type: "text",
        text: { body: input.text },
      }),
    },
  );

  if (response.status === 401 || response.status === 403) {
    throw new Error("needs_reconsent");
  }
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `WhatsApp group send failed (${response.status}): ${errText.slice(0, 200)}`,
    );
  }

  const data = await response.json();
  const messageId = (data.messages?.[0]?.id as string) ?? "";

  await supabase.from("whatsapp_messages").upsert(
    {
      owner_id: ownerId,
      group_id: input.groupId,
      whatsapp_group_id: input.whatsappGroupId,
      wa_message_id: messageId || crypto.randomUUID(),
      direction: "outbound",
      from_phone: null,
      from_name: null,
      text: input.text,
      sent_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,wa_message_id" },
  );

  return messageId;
}

async function persistResolvedWaId(
  supabase: any,
  ownerId: string,
  contactId: string,
  waId: string,
): Promise<void> {
  await supabase
    .from("contacts")
    .update({
      whatsapp_wa_id: waId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId)
    .eq("owner_id", ownerId);
}

async function persistResolvedGroupId(
  supabase: any,
  ownerId: string,
  groupId: string,
  whatsappGroupId: string,
): Promise<void> {
  await supabase
    .from("groups")
    .update({
      whatsapp_group_id: whatsappGroupId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", groupId)
    .eq("owner_id", ownerId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "missing Authorization header" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid JSON body" });
  }

  const action = body.action as string;
  if (
    action !== "list" &&
    action !== "send" &&
    action !== "listGroup" &&
    action !== "sendGroup"
  ) {
    return jsonResponse(400, { error: "missing or invalid action" });
  }

  const userClient = createClient(
    SUPABASE_URL ?? "",
    SUPABASE_ANON_KEY ?? "",
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    },
  );

  const userRes = await userClient.auth.getUser();
  if (userRes.error || !userRes.data.user) {
    return jsonResponse(401, { error: "auth failed" });
  }
  const ownerId = userRes.data.user.id;

  const adminClient = createClient(
    SUPABASE_URL ?? "",
    SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false } },
  );

  const { data: tokenData, error: tokenError } = await adminClient
    .from("user_provider_tokens")
    .select(
      "owner_id, access_token, refresh_token, scopes, provider_account_id, expires_at",
    )
    .eq("owner_id", ownerId)
    .eq("provider", "whatsapp")
    .maybeSingle();

  if (tokenError) {
    return jsonResponse(500, { status: "error", error: tokenError.message });
  }
  if (!tokenData) {
    return jsonResponse(200, { status: "no_token", messages: [] });
  }

  const tokenRow = tokenData as TokenRow;
  if (!hasWhatsAppScopes(tokenRow.scopes)) {
    return jsonResponse(200, { status: "needs_whatsapp_scopes", messages: [] });
  }

  try {
    if (action === "list") {
      if (!body.contactId) {
        return jsonResponse(400, { error: "missing contactId" });
      }
      const { messages, resolvedWaId } = await listMessagesForContact(
        adminClient,
        ownerId,
        {
          contactId: body.contactId as string,
          phone: body.phone as string | null | undefined,
          whatsappWaId: body.whatsappWaId as string | null | undefined,
          maxResults: body.maxResults as number | undefined,
        },
      );

      if (
        resolvedWaId &&
        resolvedWaId !== (body.whatsappWaId as string | null | undefined)
      ) {
        await persistResolvedWaId(
          adminClient,
          ownerId,
          body.contactId as string,
          resolvedWaId,
        );
      }

      return jsonResponse(200, {
        status:
          messages.length > 0 || resolvedWaId ? "ok" : "no_conversation",
        messages,
        resolvedWaId,
      });
    }

    if (action === "send") {
      if (!body.contactId) {
        return jsonResponse(400, { error: "missing contactId" });
      }
      if (!body.whatsappWaId || !body.text || !(body.text as string).trim()) {
        return jsonResponse(400, { error: "missing whatsappWaId or text" });
      }
      const messageId = await sendDirectMessage(
        adminClient,
        tokenRow,
        ownerId,
        {
          contactId: body.contactId as string,
          whatsappWaId: (body.whatsappWaId as string).trim(),
          text: (body.text as string).trim(),
        },
      );
      return jsonResponse(200, { status: "ok", messageId });
    }

    if (action === "listGroup") {
      if (!body.groupId) {
        return jsonResponse(400, { error: "missing groupId" });
      }
      const { messages, resolvedGroupId } = await listMessagesForGroup(
        adminClient,
        ownerId,
        {
          groupId: body.groupId as string,
          whatsappGroupId: body.whatsappGroupId as string | null | undefined,
          memberPhones: body.memberPhones as string[] | undefined,
          maxResults: body.maxResults as number | undefined,
        },
      );

      if (
        resolvedGroupId &&
        resolvedGroupId !==
          (body.whatsappGroupId as string | null | undefined)
      ) {
        await persistResolvedGroupId(
          adminClient,
          ownerId,
          body.groupId as string,
          resolvedGroupId,
        );
      }

      return jsonResponse(200, {
        status:
          messages.length > 0 || resolvedGroupId ? "ok" : "no_conversation",
        messages,
        resolvedGroupId,
      });
    }

    if (
      !body.groupId ||
      !body.whatsappGroupId ||
      !body.text ||
      !(body.text as string).trim()
    ) {
      return jsonResponse(400, {
        error: "missing groupId, whatsappGroupId, or text",
      });
    }
    const messageId = await sendGroupMessage(
      adminClient,
      tokenRow,
      ownerId,
      {
        groupId: body.groupId as string,
        whatsappGroupId: (body.whatsappGroupId as string).trim(),
        text: (body.text as string).trim(),
      },
    );
    return jsonResponse(200, { status: "ok", messageId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "needs_reconsent") {
      return jsonResponse(200, { status: "needs_reconsent" });
    }
    return jsonResponse(502, { status: "error", error: message });
  }
});
