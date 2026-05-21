// tiktok-dm Edge Function — list and send TikTok DMs for Contacts and Groups.
//
// Deploy:
//   supabase secrets set TIKTOK_CLIENT_KEY=...
//   supabase secrets set TIKTOK_CLIENT_SECRET=...
//   supabase secrets set TIKTOK_BUSINESS_ID=...
//   supabase functions deploy tiktok-dm
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const TIKTOK_BUSINESS_API = "https://business-api.tiktok.com/open_api/v1.3";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

interface TikTokMessageSummary {
  id: string;
  text: string;
  fromUsername: string | null;
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

interface DbMessageRow {
  tiktok_message_id: string;
  direction: string;
  from_username: string | null;
  text: string;
  sent_at: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CLIENT_KEY = Deno.env.get("TIKTOK_CLIENT_KEY");
const CLIENT_SECRET = Deno.env.get("TIKTOK_CLIENT_SECRET");
const BUSINESS_ID = Deno.env.get("TIKTOK_BUSINESS_ID");

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

function hasTikTokScopes(scopes: string | null): boolean {
  if (!scopes) return false;
  return (
    scopes.includes("user.info.basic") && scopes.includes("user.info.profile")
  );
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@/, "").toLowerCase();
}

function mapDbMessages(
  rows: DbMessageRow[],
  accountOpenId: string,
): TikTokMessageSummary[] {
  return rows
    .map((row) => ({
      id: row.tiktok_message_id,
      text: row.text,
      fromUsername: row.from_username,
      sentAt: row.sent_at,
      direction: (row.direction === "outbound" ? "sent" : "received") as
        | "sent"
        | "received",
    }))
    .sort(
      (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
    );
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string | null; expiresInSeconds: number }> {
  const body = new URLSearchParams({
    client_key: CLIENT_KEY ?? "",
    client_secret: CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error("needs_reconsent");
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error("needs_reconsent");
  }

  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) ?? refreshToken,
    expiresInSeconds: data.expires_in ?? 86400,
  };
}

async function persistRefreshedToken(
  supabase: any,
  ownerId: string,
  accessToken: string,
  refreshToken: string | null,
  expiresInSeconds: number,
): Promise<void> {
  const newExpires = new Date(
    Date.now() + expiresInSeconds * 1000,
  ).toISOString();
  await supabase
    .from("user_provider_tokens")
    .update({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: newExpires,
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", ownerId)
    .eq("provider", "tiktok");
}

async function withTikTokAccessToken(
  supabase: any,
  tokenRow: TokenRow,
  fn: (accessToken: string) => Promise<Response>,
): Promise<{ response: Response; accessToken: string }> {
  let accessToken = tokenRow.access_token;
  let response = await fn(accessToken);

  if (response.status !== 401 && response.status !== 403) {
    return { response, accessToken };
  }

  if (!tokenRow.refresh_token) {
    throw new Error("needs_reconsent");
  }

  const refresh = await refreshAccessToken(tokenRow.refresh_token);
  accessToken = refresh.accessToken;
  await persistRefreshedToken(
    supabase,
    tokenRow.owner_id,
    accessToken,
    refresh.refreshToken,
    refresh.expiresInSeconds,
  );
  response = await fn(accessToken);
  return { response, accessToken };
}

async function businessApiPost(
  supabase: any,
  tokenRow: TokenRow,
  path: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const { response } = await withTikTokAccessToken(
    supabase,
    tokenRow,
    (accessToken) =>
      fetch(`${TIKTOK_BUSINESS_API}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Access-Token": accessToken,
        },
        body: JSON.stringify({
          business_id: BUSINESS_ID,
          ...payload,
        }),
      }),
  );
  return response;
}

async function listMessagesFromDb(
  supabase: any,
  ownerId: string,
  filter: { contactId?: string; groupId?: string },
  limit: number,
): Promise<DbMessageRow[]> {
  let query = supabase
    .from("tiktok_messages")
    .select("tiktok_message_id, direction, from_username, text, sent_at")
    .eq("owner_id", ownerId)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (filter.contactId) {
    query = query.eq("contact_id", filter.contactId);
  }
  if (filter.groupId) {
    query = query.eq("group_id", filter.groupId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as DbMessageRow[]).reverse();
}

async function upsertMessage(
  supabase: any,
  ownerId: string,
  row: {
    tiktokMessageId: string;
    contactId?: string | null;
    groupId?: string | null;
    direction: "inbound" | "outbound";
    fromUsername?: string | null;
    text: string;
    sentAt: string;
    tiktokConversationId?: string | null;
  },
): Promise<void> {
  await supabase.from("tiktok_messages").upsert(
    {
      owner_id: ownerId,
      contact_id: row.contactId ?? null,
      group_id: row.groupId ?? null,
      tiktok_message_id: row.tiktokMessageId,
      direction: row.direction,
      from_username: row.fromUsername ?? null,
      text: row.text,
      sent_at: row.sentAt,
      tiktok_conversation_id: row.tiktokConversationId ?? null,
    },
    { onConflict: "owner_id,tiktok_message_id" },
  );
}

async function syncContactMessagesFromApi(
  supabase: any,
  tokenRow: TokenRow,
  ownerId: string,
  input: {
    contactId: string;
    openId: string;
    conversationId?: string | null;
  },
): Promise<void> {
  if (!BUSINESS_ID) return;

  let conversationId = input.conversationId ?? null;

  if (!conversationId) {
    conversationId = await findDirectConversationId(
      supabase,
      tokenRow,
      input.openId,
    );
  }

  if (!conversationId) return;

  const response = await businessApiPost(
    supabase,
    tokenRow,
    "/business/message/content/list/",
    {
      conversation_id: conversationId,
      page_size: 20,
    },
  );

  if (!response.ok) return;

  const data = await response.json();
  const messages = (data.data?.messages ?? data.data?.list ?? []) as Array<{
    message_id?: string;
    id?: string;
    content?: string;
    text?: string;
    create_time?: number;
    from_user?: { username?: string; open_id?: string };
    sender?: { username?: string; open_id?: string };
  }>;

  const accountOpenId = tokenRow.provider_account_id ?? "";

  for (const msg of messages) {
    const messageId = msg.message_id ?? msg.id;
    if (!messageId) continue;
    const senderOpenId =
      msg.from_user?.open_id ?? msg.sender?.open_id ?? "";
    const direction: "inbound" | "outbound" =
      senderOpenId === accountOpenId ? "outbound" : "inbound";
    const sentAt = msg.create_time
      ? new Date(msg.create_time * 1000).toISOString()
      : new Date().toISOString();

    await upsertMessage(supabase, ownerId, {
      tiktokMessageId: String(messageId),
      contactId: input.contactId,
      direction,
      fromUsername: msg.from_user?.username ?? msg.sender?.username ?? null,
      text: msg.content ?? msg.text ?? "",
      sentAt,
      tiktokConversationId: conversationId,
    });
  }
}

async function findDirectConversationId(
  supabase: any,
  tokenRow: TokenRow,
  participantOpenId: string,
): Promise<string | null> {
  if (!BUSINESS_ID) return null;

  const response = await businessApiPost(
    supabase,
    tokenRow,
    "/business/message/conversation/list/",
    { page_size: 50 },
  );

  if (!response.ok) return null;

  const data = await response.json();
  const conversations = (data.data?.conversations ??
    data.data?.list ??
    []) as Array<{
    conversation_id?: string;
    id?: string;
    conversation_type?: string;
    participants?: Array<{ open_id?: string; username?: string }>;
  }>;

  for (const conv of conversations) {
    const convId = conv.conversation_id ?? conv.id;
    if (!convId) continue;
    const participants = conv.participants ?? [];
    if (participants.length !== 2) continue;
    const hasParticipant = participants.some(
      (p) => p.open_id === participantOpenId,
    );
    if (hasParticipant) return String(convId);
  }

  return null;
}

async function findGroupConversationId(
  supabase: any,
  tokenRow: TokenRow,
  memberOpenIds: string[],
): Promise<string | null> {
  if (!BUSINESS_ID || memberOpenIds.length === 0) return null;

  const targetIds = new Set(memberOpenIds.filter(Boolean));
  const accountOpenId = tokenRow.provider_account_id ?? "";

  const response = await businessApiPost(
    supabase,
    tokenRow,
    "/business/message/conversation/list/",
    { page_size: 100 },
  );

  if (!response.ok) return null;

  const data = await response.json();
  const conversations = (data.data?.conversations ??
    data.data?.list ??
    []) as Array<{
    conversation_id?: string;
    id?: string;
    conversation_type?: string;
    participants?: Array<{ open_id?: string }>;
  }>;

  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const conv of conversations) {
    const convId = conv.conversation_id ?? conv.id;
    if (!convId) continue;
    const participants = conv.participants ?? [];
    if (participants.length < 3) continue;

    const openIds = new Set(
      participants.map((p) => p.open_id).filter(Boolean) as string[],
    );
    if (!openIds.has(accountOpenId)) continue;

    let matchedMembers = 0;
    for (const memberId of targetIds) {
      if (openIds.has(memberId)) matchedMembers++;
    }

    if (matchedMembers > bestScore) {
      bestScore = matchedMembers;
      bestMatch = String(convId);
    }
  }

  return bestScore >= 2 ? bestMatch : null;
}

async function resolveOpenIdFromUsername(
  supabase: any,
  tokenRow: TokenRow,
  username: string,
): Promise<string | null> {
  const normalized = normalizeUsername(username);
  if (!BUSINESS_ID) return null;

  const response = await businessApiPost(
    supabase,
    tokenRow,
    "/business/message/conversation/list/",
    { page_size: 100 },
  );

  if (!response.ok) return null;

  const data = await response.json();
  const conversations = (data.data?.conversations ??
    data.data?.list ??
    []) as Array<{
    participants?: Array<{ open_id?: string; username?: string }>;
  }>;

  for (const conv of conversations) {
    for (const p of conv.participants ?? []) {
      if (
        p.username &&
        normalizeUsername(p.username) === normalized &&
        p.open_id
      ) {
        return p.open_id;
      }
    }
  }

  return null;
}

async function sendDirectMessage(
  supabase: any,
  tokenRow: TokenRow,
  ownerId: string,
  input: {
    contactId: string;
    openId: string;
    text: string;
    conversationId?: string | null;
  },
): Promise<string> {
  if (!BUSINESS_ID) {
    throw new Error("TIKTOK_BUSINESS_ID not configured");
  }

  let conversationId =
    input.conversationId ??
    (await findDirectConversationId(supabase, tokenRow, input.openId));

  const payload: Record<string, unknown> = {
    msg_type: "TEXT",
    text: { body: input.text },
  };

  if (conversationId) {
    payload.conversation_id = conversationId;
  } else {
    payload.to_user_id = input.openId;
  }

  const response = await businessApiPost(
    supabase,
    tokenRow,
    "/business/message/send/",
    payload,
  );

  if (response.status === 401 || response.status === 403) {
    throw new Error("needs_reconsent");
  }
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `TikTok send failed (${response.status}): ${errText.slice(0, 200)}`,
    );
  }

  const data = await response.json();
  const messageId = String(
    data.data?.message_id ?? data.data?.id ?? crypto.randomUUID(),
  );
  conversationId = String(
    data.data?.conversation_id ?? conversationId ?? "",
  ) || conversationId;

  await upsertMessage(supabase, ownerId, {
    tiktokMessageId: messageId,
    contactId: input.contactId,
    direction: "outbound",
    text: input.text,
    sentAt: new Date().toISOString(),
    tiktokConversationId: conversationId,
  });

  return messageId;
}

async function sendGroupMessage(
  supabase: any,
  tokenRow: TokenRow,
  ownerId: string,
  input: {
    groupId: string;
    conversationId: string;
    text: string;
  },
): Promise<string> {
  if (!BUSINESS_ID) {
    throw new Error("TIKTOK_BUSINESS_ID not configured");
  }

  const response = await businessApiPost(
    supabase,
    tokenRow,
    "/business/message/send/",
    {
      conversation_id: input.conversationId,
      msg_type: "TEXT",
      text: { body: input.text },
    },
  );

  if (response.status === 401 || response.status === 403) {
    throw new Error("needs_reconsent");
  }
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `TikTok group send failed (${response.status}): ${errText.slice(0, 200)}`,
    );
  }

  const data = await response.json();
  const messageId = String(
    data.data?.message_id ?? data.data?.id ?? crypto.randomUUID(),
  );

  await upsertMessage(supabase, ownerId, {
    tiktokMessageId: messageId,
    groupId: input.groupId,
    direction: "outbound",
    text: input.text,
    sentAt: new Date().toISOString(),
    tiktokConversationId: input.conversationId,
  });

  return messageId;
}

async function persistResolvedOpenId(
  supabase: any,
  ownerId: string,
  contactId: string,
  openId: string,
): Promise<void> {
  await supabase
    .from("contacts")
    .update({
      tiktok_open_id: openId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId)
    .eq("owner_id", ownerId);
}

async function persistResolvedConversationId(
  supabase: any,
  ownerId: string,
  groupId: string,
  conversationId: string,
): Promise<void> {
  await supabase
    .from("groups")
    .update({
      tiktok_dm_conversation_id: conversationId,
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
    .eq("provider", "tiktok")
    .maybeSingle();

  if (tokenError) {
    return jsonResponse(500, { status: "error", error: tokenError.message });
  }
  if (!tokenData) {
    return jsonResponse(200, { status: "no_token", messages: [] });
  }

  const tokenRow = tokenData as TokenRow;
  if (!hasTikTokScopes(tokenRow.scopes)) {
    return jsonResponse(200, { status: "needs_tiktok_scopes", messages: [] });
  }

  const accountOpenId = tokenRow.provider_account_id ?? "";
  const limit = Math.min((body.maxResults as number | undefined) ?? 20, 100);

  try {
    if (action === "list") {
      if (!body.contactId) {
        return jsonResponse(400, { error: "missing contactId" });
      }

      let openId = (body.tiktokOpenId as string | null | undefined)?.trim() ||
        null;
      const username = (body.tiktokUsername as string | null | undefined)?.trim() ||
        null;

      if (!openId && username) {
        openId = await resolveOpenIdFromUsername(
          adminClient,
          tokenRow,
          username,
        );
      }

      if (openId) {
        await syncContactMessagesFromApi(adminClient, tokenRow, ownerId, {
          contactId: body.contactId as string,
          openId,
        });
      }

      const dbRows = await listMessagesFromDb(
        adminClient,
        ownerId,
        { contactId: body.contactId as string },
        limit,
      );
      const messages = mapDbMessages(dbRows, accountOpenId);

      if (
        openId &&
        openId !== (body.tiktokOpenId as string | null | undefined)
      ) {
        await persistResolvedOpenId(
          adminClient,
          ownerId,
          body.contactId as string,
          openId,
        );
      }

      return jsonResponse(200, {
        status: messages.length > 0 || openId ? "ok" : "no_conversation",
        messages,
        resolvedOpenId: openId,
      });
    }

    if (action === "send") {
      if (!body.tiktokOpenId || !body.text || !(body.text as string).trim()) {
        return jsonResponse(400, { error: "missing tiktokOpenId or text" });
      }
      const messageId = await sendDirectMessage(
        adminClient,
        tokenRow,
        ownerId,
        {
          contactId: body.contactId as string,
          openId: (body.tiktokOpenId as string).trim(),
          text: (body.text as string).trim(),
        },
      );
      return jsonResponse(200, { status: "ok", messageId });
    }

    if (action === "listGroup") {
      if (!body.groupId) {
        return jsonResponse(400, { error: "missing groupId" });
      }

      let conversationId =
        (body.tiktokDmConversationId as string | null | undefined)?.trim() ||
        null;
      const memberOpenIds = body.memberTikTokOpenIds as string[] | undefined;

      if (!conversationId && memberOpenIds && memberOpenIds.length > 0) {
        conversationId = await findGroupConversationId(
          adminClient,
          tokenRow,
          memberOpenIds,
        );
      }

      if (conversationId && BUSINESS_ID) {
        const response = await businessApiPost(
          adminClient,
          tokenRow,
          "/business/message/content/list/",
          { conversation_id: conversationId, page_size: 20 },
        );
        if (response.ok) {
          const data = await response.json();
          const apiMessages = (data.data?.messages ??
            data.data?.list ??
            []) as Array<{
            message_id?: string;
            id?: string;
            content?: string;
            text?: string;
            create_time?: number;
            from_user?: { username?: string; open_id?: string };
          }>;
          for (const msg of apiMessages) {
            const messageId = msg.message_id ?? msg.id;
            if (!messageId) continue;
            const senderOpenId = msg.from_user?.open_id ?? "";
            await upsertMessage(adminClient, ownerId, {
              tiktokMessageId: String(messageId),
              groupId: body.groupId as string,
              direction:
                senderOpenId === accountOpenId ? "outbound" : "inbound",
              fromUsername: msg.from_user?.username ?? null,
              text: msg.content ?? msg.text ?? "",
              sentAt: msg.create_time
                ? new Date(msg.create_time * 1000).toISOString()
                : new Date().toISOString(),
              tiktokConversationId: conversationId,
            });
          }
        }
      }

      const dbRows = await listMessagesFromDb(
        adminClient,
        ownerId,
        { groupId: body.groupId as string },
        limit,
      );
      const messages = mapDbMessages(dbRows, accountOpenId);

      if (
        conversationId &&
        conversationId !==
          (body.tiktokDmConversationId as string | null | undefined)
      ) {
        await persistResolvedConversationId(
          adminClient,
          ownerId,
          body.groupId as string,
          conversationId,
        );
      }

      return jsonResponse(200, {
        status:
          messages.length > 0 || conversationId ? "ok" : "no_conversation",
        messages,
        resolvedConversationId: conversationId,
      });
    }

    if (!body.tiktokDmConversationId || !body.text || !(body.text as string).trim()) {
      return jsonResponse(400, {
        error: "missing tiktokDmConversationId or text",
      });
    }
    const messageId = await sendGroupMessage(
      adminClient,
      tokenRow,
      ownerId,
      {
        groupId: body.groupId as string,
        conversationId: (body.tiktokDmConversationId as string).trim(),
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
