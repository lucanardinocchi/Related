// x-dm Edge Function — list and send X DMs for Contacts and Groups.
//
// Deploy:
//   supabase secrets set X_CLIENT_ID=...
//   supabase secrets set X_CLIENT_SECRET=...
//   supabase functions deploy x-dm
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const X_API = "https://api.twitter.com/2";
const X_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const X_SCOPE_DM_READ = "dm.read";
const X_SCOPE_DM_WRITE = "dm.write";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

interface XMessageSummary {
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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CLIENT_ID = Deno.env.get("X_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("X_CLIENT_SECRET");

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

function hasXScopes(scopes: string | null): boolean {
  if (!scopes) return false;
  return scopes.includes(X_SCOPE_DM_READ) && scopes.includes(X_SCOPE_DM_WRITE);
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@/, "").toLowerCase();
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string | null; expiresInSeconds: number }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLIENT_ID ?? "",
  });

  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (CLIENT_SECRET) {
    headers.authorization =
      `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`;
  }

  const response = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers,
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
    expiresInSeconds: data.expires_in ?? 7200,
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
    .eq("provider", "x");
}

async function withXAccessToken(
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

async function xFetch(
  supabase: any,
  tokenRow: TokenRow,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const { response } = await withXAccessToken(
    supabase,
    tokenRow,
    (accessToken) =>
      fetch(`${X_API}${path}`, {
        ...init,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
          ...(init?.headers ?? {}),
        },
      }),
  );
  return response;
}

async function resolveUserIdFromUsername(
  supabase: any,
  tokenRow: TokenRow,
  username: string,
): Promise<string | null> {
  const normalized = normalizeUsername(username);
  const response = await xFetch(
    supabase,
    tokenRow,
    `/users/by/username/${encodeURIComponent(normalized)}?user.fields=id,username`,
  );

  if (response.status === 401 || response.status === 403) {
    throw new Error("needs_reconsent");
  }
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return (data.data?.id as string) ?? null;
}

function mapDmEvents(
  data: Record<string, unknown>,
  accountId: string,
): XMessageSummary[] {
  const events = (data.data ?? []) as Array<{
    id: string;
    text?: string;
    sender_id?: string;
    created_at?: string;
  }>;
  const users = (data.includes as { users?: Array<{ id: string; username?: string }> } | undefined)
    ?.users ?? [];
  const usernameById = new Map(
    users.map((u) => [u.id, u.username ?? null]),
  );

  return events
    .filter((e) => e.text !== undefined)
    .map((e) => {
      const senderId = e.sender_id ?? "";
      const direction: "sent" | "received" =
        senderId === accountId ? "sent" : "received";
      return {
        id: e.id,
        text: e.text ?? "",
        fromUsername: usernameById.get(senderId) ?? null,
        sentAt: e.created_at ?? "",
        direction,
      };
    })
    .sort(
      (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
    );
}

async function listMessagesForContact(
  supabase: any,
  tokenRow: TokenRow,
  input: {
    xUsername?: string | null;
    xUserId?: string | null;
    maxResults?: number;
  },
): Promise<{ messages: XMessageSummary[]; resolvedUserId: string | null }> {
  const accountId = tokenRow.provider_account_id;
  if (!accountId) {
    throw new Error("X account ID missing — reconnect in Settings.");
  }

  let userId = input.xUserId?.trim() || null;
  const username = input.xUsername?.trim() || null;

  if (!userId && username) {
    userId = await resolveUserIdFromUsername(supabase, tokenRow, username);
  }

  if (!userId) {
    return { messages: [], resolvedUserId: null };
  }

  const limit = Math.min(input.maxResults ?? 20, 100);
  const path =
    `/dm_conversations/with/${encodeURIComponent(userId)}/dm_events?max_results=${limit}&dm_event.fields=created_at,sender_id,text&event_types=MessageCreate&expansions=sender_id&user.fields=username`;

  const response = await xFetch(supabase, tokenRow, path);

  if (response.status === 401 || response.status === 403) {
    throw new Error("needs_reconsent");
  }
  if (response.status === 404) {
    return { messages: [], resolvedUserId: userId };
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `X DM fetch failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }

  const data = await response.json();
  const messages = mapDmEvents(data, accountId);
  return { messages, resolvedUserId: userId };
}

async function listMessagesForGroup(
  supabase: any,
  tokenRow: TokenRow,
  input: {
    xDmConversationId?: string | null;
    memberXUserIds?: string[];
    maxResults?: number;
  },
): Promise<{ messages: XMessageSummary[]; resolvedConversationId: string | null }> {
  const accountId = tokenRow.provider_account_id;
  if (!accountId) {
    throw new Error("X account ID missing — reconnect in Settings.");
  }

  let conversationId = input.xDmConversationId?.trim() || null;

  if (!conversationId && input.memberXUserIds && input.memberXUserIds.length > 0) {
    conversationId = await findGroupConversationId(
      supabase,
      tokenRow,
      accountId,
      input.memberXUserIds,
    );
  }

  if (!conversationId) {
    return { messages: [], resolvedConversationId: null };
  }

  const limit = Math.min(input.maxResults ?? 20, 100);
  const path =
    `/dm_conversations/${encodeURIComponent(conversationId)}/dm_events?max_results=${limit}&dm_event.fields=created_at,sender_id,text&event_types=MessageCreate&expansions=sender_id&user.fields=username`;

  const response = await xFetch(supabase, tokenRow, path);

  if (response.status === 401 || response.status === 403) {
    throw new Error("needs_reconsent");
  }
  if (response.status === 404) {
    return { messages: [], resolvedConversationId: conversationId };
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `X group DM fetch failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }

  const data = await response.json();
  const messages = mapDmEvents(data, accountId);
  return { messages, resolvedConversationId: conversationId };
}

async function findGroupConversationId(
  supabase: any,
  tokenRow: TokenRow,
  accountId: string,
  memberUserIds: string[],
): Promise<string | null> {
  const targetIds = new Set(memberUserIds.filter(Boolean));
  if (targetIds.size === 0) return null;

  const path =
    "/dm_events?max_results=100&dm_event.fields=created_at,sender_id,dm_conversation_id&event_types=MessageCreate";
  const response = await xFetch(supabase, tokenRow, path);

  if (!response.ok) return null;

  const data = await response.json();
  const events = (data.data ?? []) as Array<{
    sender_id?: string;
    dm_conversation_id?: string;
  }>;

  const sendersByConversation = new Map<string, Set<string>>();
  for (const event of events) {
    const convId = event.dm_conversation_id;
    const senderId = event.sender_id;
    if (!convId || !senderId) continue;
    if (!sendersByConversation.has(convId)) {
      sendersByConversation.set(convId, new Set());
    }
    sendersByConversation.get(convId)!.add(senderId);
  }

  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const [convId, senders] of sendersByConversation) {
    if (senders.size < 3) continue;
    if (!senders.has(accountId)) continue;

    let matchedMembers = 0;
    for (const memberId of targetIds) {
      if (senders.has(memberId)) matchedMembers++;
    }

    if (matchedMembers > bestScore) {
      bestScore = matchedMembers;
      bestMatch = convId;
    }
  }

  return bestScore >= 2 ? bestMatch : null;
}

async function sendDirectMessage(
  supabase: any,
  tokenRow: TokenRow,
  participantId: string,
  text: string,
): Promise<string> {
  const path =
    `/dm_conversations/with/${encodeURIComponent(participantId)}/messages`;
  const response = await xFetch(supabase, tokenRow, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("needs_reconsent");
  }
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `X send failed (${response.status}): ${errText.slice(0, 200)}`,
    );
  }

  const data = await response.json();
  return (data.data?.dm_event_id as string) ?? (data.data?.id as string) ?? "";
}

async function sendGroupMessage(
  supabase: any,
  tokenRow: TokenRow,
  conversationId: string,
  text: string,
): Promise<string> {
  const path =
    `/dm_conversations/${encodeURIComponent(conversationId)}/messages`;
  const response = await xFetch(supabase, tokenRow, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("needs_reconsent");
  }
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `X group send failed (${response.status}): ${errText.slice(0, 200)}`,
    );
  }

  const data = await response.json();
  return (data.data?.dm_event_id as string) ?? (data.data?.id as string) ?? "";
}

async function persistResolvedUserId(
  supabase: any,
  ownerId: string,
  contactId: string,
  userId: string,
): Promise<void> {
  await supabase
    .from("contacts")
    .update({
      x_user_id: userId,
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
      x_dm_conversation_id: conversationId,
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
    .eq("provider", "x")
    .maybeSingle();

  if (tokenError) {
    return jsonResponse(500, { status: "error", error: tokenError.message });
  }
  if (!tokenData) {
    return jsonResponse(200, { status: "no_token", messages: [] });
  }

  const tokenRow = tokenData as TokenRow;
  if (!hasXScopes(tokenRow.scopes)) {
    return jsonResponse(200, { status: "needs_x_scopes", messages: [] });
  }

  try {
    if (action === "list") {
      if (!body.contactId) {
        return jsonResponse(400, { error: "missing contactId" });
      }
      const { messages, resolvedUserId } = await listMessagesForContact(
        adminClient,
        tokenRow,
        {
          xUsername: body.xUsername as string | null | undefined,
          xUserId: body.xUserId as string | null | undefined,
          maxResults: body.maxResults as number | undefined,
        },
      );

      if (
        resolvedUserId &&
        resolvedUserId !== (body.xUserId as string | null | undefined)
      ) {
        await persistResolvedUserId(
          adminClient,
          ownerId,
          body.contactId as string,
          resolvedUserId,
        );
      }

      return jsonResponse(200, {
        status:
          messages.length > 0 || resolvedUserId ? "ok" : "no_conversation",
        messages,
        resolvedUserId,
      });
    }

    if (action === "send") {
      if (!body.xUserId || !body.text || !(body.text as string).trim()) {
        return jsonResponse(400, { error: "missing xUserId or text" });
      }
      const messageId = await sendDirectMessage(
        adminClient,
        tokenRow,
        (body.xUserId as string).trim(),
        (body.text as string).trim(),
      );
      return jsonResponse(200, { status: "ok", messageId });
    }

    if (action === "listGroup") {
      if (!body.groupId) {
        return jsonResponse(400, { error: "missing groupId" });
      }
      const { messages, resolvedConversationId } = await listMessagesForGroup(
        adminClient,
        tokenRow,
        {
          xDmConversationId: body.xDmConversationId as
            | string
            | null
            | undefined,
          memberXUserIds: body.memberXUserIds as string[] | undefined,
          maxResults: body.maxResults as number | undefined,
        },
      );

      if (
        resolvedConversationId &&
        resolvedConversationId !==
          (body.xDmConversationId as string | null | undefined)
      ) {
        await persistResolvedConversationId(
          adminClient,
          ownerId,
          body.groupId as string,
          resolvedConversationId,
        );
      }

      return jsonResponse(200, {
        status:
          messages.length > 0 || resolvedConversationId
            ? "ok"
            : "no_conversation",
        messages,
        resolvedConversationId,
      });
    }

    if (!body.xDmConversationId || !body.text || !(body.text as string).trim()) {
      return jsonResponse(400, {
        error: "missing xDmConversationId or text",
      });
    }
    const messageId = await sendGroupMessage(
      adminClient,
      tokenRow,
      (body.xDmConversationId as string).trim(),
      (body.text as string).trim(),
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
