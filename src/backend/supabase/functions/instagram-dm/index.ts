// instagram-dm Edge Function — list and send Instagram DMs for a Contact.
//
// Authenticates the User via JWT, reads their Instagram OAuth token from
// user_provider_tokens (service role), and proxies Instagram Graph API calls.
//
// Deploy:
//   supabase secrets set INSTAGRAM_APP_ID=...
//   supabase secrets set INSTAGRAM_APP_SECRET=...
//   supabase functions deploy instagram-dm
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { upsertInstagramMessage } from "../_shared/instagramMessages.ts";

const INSTAGRAM_GRAPH = "https://graph.instagram.com";
const INSTAGRAM_SCOPE_BASIC = "instagram_business_basic";
const INSTAGRAM_SCOPE_MANAGE_MESSAGES = "instagram_business_manage_messages";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

interface ListRequest {
  action: "list";
  contactId: string;
  instagramUsername?: string | null;
  instagramScopedId?: string | null;
  maxResults?: number;
}

interface SendRequest {
  action: "send";
  contactId: string;
  instagramScopedId: string;
  text: string;
}

type InstagramDmRequest = ListRequest | SendRequest;

interface InstagramMessageSummary {
  id: string;
  text: string;
  fromUsername: string | null;
  toUsername: string | null;
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
const APP_SECRET = Deno.env.get("INSTAGRAM_APP_SECRET");

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

function hasInstagramScopes(scopes: string | null): boolean {
  if (!scopes) return false;
  return (
    scopes.includes(INSTAGRAM_SCOPE_BASIC) &&
    scopes.includes(INSTAGRAM_SCOPE_MANAGE_MESSAGES)
  );
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@/, "").toLowerCase();
}

async function igFetch(
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<Response> {
  const separator = url.includes("?") ? "&" : "?";
  const authedUrl = url.includes("access_token=")
    ? url
    : `${url}${separator}access_token=${encodeURIComponent(accessToken)}`;
  return fetch(authedUrl, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function refreshLongLivedToken(
  accessToken: string,
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const url =
    `${INSTAGRAM_GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(url);
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
      refresh_token: accessToken,
      expires_at: newExpires,
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", ownerId)
    .eq("provider", "instagram");
}

async function withInstagramAccessToken(
  supabase: any,
  tokenRow: TokenRow,
  fn: (accessToken: string) => Promise<Response>,
): Promise<{ response: Response; accessToken: string }> {
  let accessToken = tokenRow.access_token;
  let response = await fn(accessToken);

  if (response.status !== 401 && response.status !== 190) {
    return { response, accessToken };
  }

  const refresh = await refreshLongLivedToken(accessToken);
  accessToken = refresh.accessToken;
  await persistRefreshedToken(
    supabase,
    tokenRow.owner_id,
    accessToken,
    refresh.expiresInSeconds,
  );
  response = await fn(accessToken);
  return { response, accessToken };
}

async function findConversationId(
  supabase: any,
  tokenRow: TokenRow,
  scopedId: string,
): Promise<string | null> {
  const url =
    `${INSTAGRAM_GRAPH}/me/conversations?platform=instagram&user_id=${encodeURIComponent(scopedId)}`;
  const { response } = await withInstagramAccessToken(
    supabase,
    tokenRow,
    (accessToken) => igFetch(url, accessToken),
  );

  if (response.status === 401 || response.status === 190) {
    throw new Error("needs_reconsent");
  }
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const conversation = (data.data ?? [])[0];
  return conversation?.id ?? null;
}

async function resolveScopedIdFromUsername(
  supabase: any,
  tokenRow: TokenRow,
  username: string,
): Promise<string | null> {
  const normalized = normalizeUsername(username);
  const listUrl = `${INSTAGRAM_GRAPH}/me/conversations?platform=instagram&limit=25`;
  const { response: listResponse } = await withInstagramAccessToken(
    supabase,
    tokenRow,
    (accessToken) => igFetch(listUrl, accessToken),
  );

  if (listResponse.status === 401 || listResponse.status === 190) {
    throw new Error("needs_reconsent");
  }
  if (!listResponse.ok) {
    return null;
  }

  const listData = await listResponse.json();
  const conversations: Array<{ id: string }> = listData.data ?? [];

  for (const conversation of conversations) {
    const detailUrl =
      `${INSTAGRAM_GRAPH}/${conversation.id}?fields=messages&limit=1`;
    const { response: detailResponse } = await withInstagramAccessToken(
      supabase,
      tokenRow,
      (accessToken) => igFetch(detailUrl, accessToken),
    );
    if (!detailResponse.ok) continue;

    const detail = await detailResponse.json();
    const messageRefs: Array<{ id: string }> = detail.messages?.data ?? [];
    if (messageRefs.length === 0) continue;

    const messageUrl =
      `${INSTAGRAM_GRAPH}/${messageRefs[0]!.id}?fields=from,to`;
    const { response: messageResponse } = await withInstagramAccessToken(
      supabase,
      tokenRow,
      (accessToken) => igFetch(messageUrl, accessToken),
    );
    if (!messageResponse.ok) continue;

    const message = await messageResponse.json();
    const fromUsername = message.from?.username as string | undefined;
    const toEntries = (message.to?.data ?? []) as Array<{ username?: string }>;

    if (fromUsername && normalizeUsername(fromUsername) === normalized) {
      return message.from?.id ?? null;
    }

    for (const to of toEntries) {
      if (to.username && normalizeUsername(to.username) === normalized) {
        return message.from?.id ?? null;
      }
    }
  }

  return null;
}

async function fetchMessageDetail(
  supabase: any,
  tokenRow: TokenRow,
  messageId: string,
  accountId: string,
): Promise<InstagramMessageSummary | null> {
  const url =
    `${INSTAGRAM_GRAPH}/${messageId}?fields=id,created_time,from,to,message`;
  const { response } = await withInstagramAccessToken(
    supabase,
    tokenRow,
    (accessToken) => igFetch(url, accessToken),
  );
  if (!response.ok) return null;

  const detail = await response.json();
  const fromId = detail.from?.id as string | undefined;
  const direction: "sent" | "received" =
    fromId === accountId ? "sent" : "received";

  return {
    id: detail.id as string,
    text: (detail.message as string) ?? "",
    fromUsername: (detail.from?.username as string) ?? null,
    toUsername: ((detail.to?.data ?? [])[0]?.username as string) ?? null,
    sentAt: (detail.created_time as string) ?? "",
    direction,
  };
}

function rowToSummary(
  row: {
    ig_message_id: string;
    direction: string;
    from_username: string | null;
    text: string;
    sent_at: string;
  },
  accountId: string,
  contactUsername: string | null,
): InstagramMessageSummary {
  const direction: "sent" | "received" =
    row.direction === "outbound" ? "sent" : "received";
  return {
    id: row.ig_message_id,
    text: row.text,
    fromUsername:
      direction === "sent"
        ? null
        : row.from_username ?? contactUsername,
    toUsername: direction === "sent" ? contactUsername : null,
    sentAt: row.sent_at,
    direction,
  };
}

async function listMessagesFromDb(
  supabase: any,
  ownerId: string,
  contactId: string,
  accountId: string,
  contactUsername: string | null,
): Promise<InstagramMessageSummary[]> {
  const { data, error } = await supabase
    .from("instagram_messages")
    .select("ig_message_id, direction, from_username, text, sent_at")
    .eq("owner_id", ownerId)
    .eq("contact_id", contactId)
    .order("sent_at", { ascending: true })
    .limit(100);

  if (error || !data) return [];
  return (data as Array<{
    ig_message_id: string;
    direction: string;
    from_username: string | null;
    text: string;
    sent_at: string;
  }>).map((row) => rowToSummary(row, accountId, contactUsername));
}

async function persistApiMessages(
  supabase: any,
  ownerId: string,
  contactId: string,
  accountId: string,
  messages: InstagramMessageSummary[],
  contactScopedId: string | null,
): Promise<void> {
  for (const message of messages) {
    await upsertInstagramMessage(supabase, {
      ownerId,
      contactId,
      message: {
        ig_message_id: message.id,
        direction: message.direction === "sent" ? "outbound" : "inbound",
        from_username: message.fromUsername,
        from_scoped_id:
          message.direction === "sent" ? accountId : contactScopedId,
        text: message.text,
        sent_at: message.sentAt || new Date().toISOString(),
      },
    });
  }
}

async function listMessagesForContact(
  supabase: any,
  tokenRow: TokenRow,
  input: ListRequest,
  ownerId: string,
): Promise<{ messages: InstagramMessageSummary[]; resolvedScopedId: string | null }> {
  const accountId = tokenRow.provider_account_id;
  if (!accountId) {
    throw new Error("Instagram account ID missing — reconnect in Settings.");
  }

  let scopedId = input.instagramScopedId?.trim() || null;
  const username = input.instagramUsername?.trim() || null;

  if (!scopedId && username) {
    scopedId = await resolveScopedIdFromUsername(supabase, tokenRow, username);
  }

  const contactUsername = username?.replace(/^@/, "") ?? null;
  const cached = await listMessagesFromDb(
    supabase,
    ownerId,
    input.contactId,
    accountId,
    contactUsername,
  );

  if (!scopedId) {
    return { messages: cached, resolvedScopedId: null };
  }

  const conversationId = await findConversationId(supabase, tokenRow, scopedId);
  if (!conversationId) {
    return { messages: cached, resolvedScopedId: scopedId };
  }

  const convUrl =
    `${INSTAGRAM_GRAPH}/${conversationId}?fields=messages&limit=${Math.min(input.maxResults ?? 20, 20)}`;
  const { response: convResponse } = await withInstagramAccessToken(
    supabase,
    tokenRow,
    (accessToken) => igFetch(convUrl, accessToken),
  );

  if (convResponse.status === 401 || convResponse.status === 190) {
    throw new Error("needs_reconsent");
  }
  if (!convResponse.ok) {
    const text = await convResponse.text();
    throw new Error(
      `Instagram conversation fetch failed (${convResponse.status}): ${text.slice(0, 200)}`,
    );
  }

  const convData = await convResponse.json();
  const refs: Array<{ id: string }> = convData.messages?.data ?? [];
  const summaries = await Promise.all(
    refs.map((ref) =>
      fetchMessageDetail(supabase, tokenRow, ref.id, accountId),
    ),
  );

  const apiMessages = summaries
    .filter((m): m is InstagramMessageSummary => m !== null)
    .sort(
      (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
    );

  if (apiMessages.length > 0) {
    await persistApiMessages(
      supabase,
      ownerId,
      input.contactId,
      accountId,
      apiMessages,
      scopedId,
    );
  }

  const merged = await listMessagesFromDb(
    supabase,
    ownerId,
    input.contactId,
    accountId,
    contactUsername,
  );

  return {
    messages: merged.length > 0 ? merged : apiMessages,
    resolvedScopedId: scopedId,
  };
}

async function sendMessage(
  supabase: any,
  tokenRow: TokenRow,
  input: { instagramScopedId: string; text: string },
): Promise<string> {
  const accountId = tokenRow.provider_account_id;
  if (!accountId) {
    throw new Error("Instagram account ID missing — reconnect in Settings.");
  }

  const url = `${INSTAGRAM_GRAPH}/v21.0/${accountId}/messages`;
  const payload = {
    recipient: { id: input.instagramScopedId },
    message: { text: input.text },
  };

  const { response } = await withInstagramAccessToken(
    supabase,
    tokenRow,
    (accessToken) =>
      igFetch(url, accessToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
  );

  if (response.status === 401 || response.status === 190) {
    throw new Error("needs_reconsent");
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Instagram send failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }

  const data = await response.json();
  return (data.message_id as string) ?? "";
}

async function persistResolvedScopedId(
  supabase: any,
  ownerId: string,
  contactId: string,
  scopedId: string,
): Promise<void> {
  await supabase
    .from("contacts")
    .update({
      instagram_scoped_id: scopedId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId)
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

  let body: InstagramDmRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid JSON body" });
  }

  if (body.action !== "list" && body.action !== "send") {
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
    .eq("provider", "instagram")
    .maybeSingle();

  if (tokenError) {
    return jsonResponse(500, { status: "error", error: tokenError.message });
  }
  if (!tokenData) {
    return jsonResponse(200, { status: "no_token", messages: [] });
  }

  const tokenRow = tokenData as TokenRow;
  if (!hasInstagramScopes(tokenRow.scopes)) {
    return jsonResponse(200, { status: "needs_instagram_scopes", messages: [] });
  }

  try {
    if (body.action === "list") {
      if (!body.contactId) {
        return jsonResponse(400, { error: "missing contactId" });
      }
      const { messages, resolvedScopedId } = await listMessagesForContact(
        adminClient,
        tokenRow,
        body,
        ownerId,
      );

      if (
        resolvedScopedId &&
        resolvedScopedId !== (body.instagramScopedId ?? null)
      ) {
        await persistResolvedScopedId(
          adminClient,
          ownerId,
          body.contactId,
          resolvedScopedId,
        );
      }

      return jsonResponse(200, {
        status: messages.length > 0 || resolvedScopedId ? "ok" : "no_conversation",
        messages,
        resolvedScopedId,
      });
    }

    if (!body.instagramScopedId || !body.text?.trim()) {
      return jsonResponse(400, { error: "missing instagramScopedId or text" });
    }

    const messageId = await sendMessage(adminClient, tokenRow, {
      instagramScopedId: body.instagramScopedId.trim(),
      text: body.text.trim(),
    });

    const accountId = tokenRow.provider_account_id;
    if (accountId && messageId) {
      await upsertInstagramMessage(adminClient, {
        ownerId,
        contactId: body.contactId,
        message: {
          ig_message_id: messageId,
          direction: "outbound",
          from_username: null,
          from_scoped_id: accountId,
          text: body.text.trim(),
          sent_at: new Date().toISOString(),
        },
      });
    }

    return jsonResponse(200, { status: "ok", messageId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "needs_reconsent") {
      return jsonResponse(200, { status: "needs_reconsent" });
    }
    return jsonResponse(502, { status: "error", error: message });
  }
});
