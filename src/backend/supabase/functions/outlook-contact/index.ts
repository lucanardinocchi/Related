// outlook-contact Edge Function — list and send Outlook mail for a Contact email.
//
// Authenticates the User via JWT, reads their Microsoft OAuth token from
// user_provider_tokens (service role), and proxies Microsoft Graph mail calls.
// Token refresh on 401 mirrors sync-calendar.
//
// Deploy:
//   supabase secrets set MICROSOFT_CLIENT_ID=...
//   supabase secrets set MICROSOFT_CLIENT_SECRET=...
//   supabase functions deploy outlook-contact
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const MICROSOFT_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_MESSAGES_URL = "https://graph.microsoft.com/v1.0/me/messages";
const GRAPH_SEND_MAIL_URL = "https://graph.microsoft.com/v1.0/me/sendMail";

const OUTLOOK_SCOPES =
  "Calendars.Read Mail.Read Mail.Send offline_access User.Read";
const MAIL_READ_SCOPE = "Mail.Read";
const MAIL_SEND_SCOPE = "Mail.Send";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

interface ListRequest {
  action: "list";
  contactEmail: string;
  maxResults?: number;
}

interface SendRequest {
  action: "send";
  to: string;
  subject: string;
  body: string;
}

interface GetRequest {
  action: "get";
  messageId: string;
}

type OutlookContactRequest = ListRequest | SendRequest | GetRequest;

interface OutlookMessageSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  direction: "sent" | "received";
}

interface OutlookMessageDetail {
  id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
}

interface TokenRow {
  owner_id: string;
  access_token: string;
  refresh_token: string | null;
  scopes: string | null;
}

interface GraphEmailAddress {
  emailAddress?: { address?: string; name?: string };
}

interface GraphMessage {
  id?: string;
  conversationId?: string;
  subject?: string;
  from?: GraphEmailAddress;
  toRecipients?: GraphEmailAddress[];
  receivedDateTime?: string;
  sentDateTime?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET");

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

function hasOutlookMailScopes(scopes: string | null): boolean {
  if (!scopes) return false;
  return scopes.includes(MAIL_READ_SCOPE) && scopes.includes(MAIL_SEND_SCOPE);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function formatEmailAddress(entry: GraphEmailAddress | undefined): string {
  const address = entry?.emailAddress?.address ?? "";
  const name = entry?.emailAddress?.name?.trim();
  if (name && address) return `${name} <${address}>`;
  return address;
}

function formatRecipients(recipients: GraphEmailAddress[] | undefined): string {
  return (recipients ?? []).map((r) => formatEmailAddress(r)).filter(Boolean).join(", ");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractBodyContent(message: GraphMessage): string {
  const content = message.body?.content ?? "";
  if (!content) return message.bodyPreview ?? "";
  if (message.body?.contentType?.toLowerCase() === "html") {
    return stripHtml(content);
  }
  return content.trim();
}

function inferDirection(
  message: GraphMessage,
  contactEmail: string,
): "sent" | "received" {
  const normalized = normalizeEmail(contactEmail);
  const fromAddress = normalizeEmail(message.from?.emailAddress?.address ?? "");
  if (fromAddress === normalized) return "received";

  const toAddresses = (message.toRecipients ?? [])
    .map((r) => normalizeEmail(r.emailAddress?.address ?? ""))
    .filter(Boolean);
  if (toAddresses.includes(normalized)) return "sent";

  return "received";
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    scope: OUTLOOK_SCOPES,
  });
  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(`Microsoft token refresh failed (${response.status})`);
  }
  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Microsoft token refresh returned no access_token");
  }
  return {
    accessToken: data.access_token,
    expiresInSeconds: data.expires_in ?? 3600,
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
    .eq("provider", "outlook");
}

async function graphFetch(
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function withOutlookAccessToken(
  supabase: any,
  tokenRow: TokenRow,
  fn: (accessToken: string) => Promise<Response>,
): Promise<{ response: Response; accessToken: string }> {
  let accessToken = tokenRow.access_token;
  let response = await fn(accessToken);

  if (response.status !== 401) {
    return { response, accessToken };
  }

  if (!tokenRow.refresh_token || !CLIENT_ID || !CLIENT_SECRET) {
    return { response, accessToken };
  }

  const refresh = await refreshAccessToken(
    tokenRow.refresh_token,
    CLIENT_ID,
    CLIENT_SECRET,
  );
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

function mapMessageSummary(
  message: GraphMessage,
  contactEmail: string,
): OutlookMessageSummary | null {
  if (!message.id) return null;
  const from = formatEmailAddress(message.from);
  const to = formatRecipients(message.toRecipients);
  const date = message.receivedDateTime ?? message.sentDateTime ?? "";
  return {
    id: message.id,
    threadId: message.conversationId ?? message.id,
    subject: message.subject?.trim() || "(no subject)",
    from,
    to,
    date,
    snippet: message.bodyPreview ?? "",
    direction: inferDirection(message, contactEmail),
  };
}

async function listMessagesForContact(
  supabase: any,
  tokenRow: TokenRow,
  contactEmail: string,
  maxResults: number,
): Promise<OutlookMessageSummary[]> {
  const normalized = escapeODataString(normalizeEmail(contactEmail));
  const filter = encodeURIComponent(
    `from/emailAddress/address eq '${normalized}' or toRecipients/any(r:r/emailAddress/address eq '${normalized}')`,
  );
  const select = encodeURIComponent(
    "id,conversationId,subject,from,toRecipients,receivedDateTime,sentDateTime,bodyPreview",
  );
  const listUrl =
    `${GRAPH_MESSAGES_URL}?$filter=${filter}&$select=${select}&$orderby=receivedDateTime desc&$top=${maxResults}`;

  const { response: listResponse } = await withOutlookAccessToken(
    supabase,
    tokenRow,
    (accessToken) => graphFetch(listUrl, accessToken),
  );

  if (listResponse.status === 401) {
    throw new Error("needs_reconsent");
  }
  if (!listResponse.ok) {
    const text = await listResponse.text();
    throw new Error(
      `Outlook list failed (${listResponse.status}): ${text.slice(0, 200)}`,
    );
  }

  const listData = await listResponse.json();
  const messages: GraphMessage[] = listData.value ?? [];
  return messages
    .map((message) => mapMessageSummary(message, contactEmail))
    .filter((m): m is OutlookMessageSummary => m !== null);
}

async function getMessageDetail(
  supabase: any,
  tokenRow: TokenRow,
  messageId: string,
): Promise<OutlookMessageDetail | null> {
  const select = encodeURIComponent(
    "id,subject,from,toRecipients,receivedDateTime,sentDateTime,body,bodyPreview",
  );
  const detailUrl = `${GRAPH_MESSAGES_URL}/${messageId}?$select=${select}`;
  const { response: detailResponse } = await withOutlookAccessToken(
    supabase,
    tokenRow,
    (accessToken) => graphFetch(detailUrl, accessToken),
  );

  if (detailResponse.status === 401) {
    throw new Error("needs_reconsent");
  }
  if (!detailResponse.ok) return null;

  const message = (await detailResponse.json()) as GraphMessage;
  if (!message.id) return null;

  const body = extractBodyContent(message);
  return {
    id: message.id,
    subject: message.subject?.trim() || "(no subject)",
    from: formatEmailAddress(message.from),
    to: formatRecipients(message.toRecipients),
    date: message.receivedDateTime ?? message.sentDateTime ?? "",
    body: body || message.bodyPreview || "",
  };
}

async function sendMessage(
  supabase: any,
  tokenRow: TokenRow,
  input: { to: string; subject: string; body: string },
): Promise<string> {
  const payload = {
    message: {
      subject: input.subject,
      body: {
        contentType: "Text",
        content: input.body,
      },
      toRecipients: [
        {
          emailAddress: {
            address: input.to,
          },
        },
      ],
    },
  };

  const { response } = await withOutlookAccessToken(
    supabase,
    tokenRow,
    (accessToken) =>
      graphFetch(GRAPH_SEND_MAIL_URL, accessToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
  );

  if (response.status === 401) {
    throw new Error("needs_reconsent");
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Outlook send failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }

  // sendMail returns 202 Accepted with no message id.
  return "";
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

  let body: OutlookContactRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid JSON body" });
  }

  if (body.action !== "list" && body.action !== "send" && body.action !== "get") {
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
    .select("owner_id, access_token, refresh_token, scopes")
    .eq("owner_id", ownerId)
    .eq("provider", "outlook")
    .maybeSingle();

  if (tokenError) {
    return jsonResponse(500, { status: "error", error: tokenError.message });
  }
  if (!tokenData) {
    return jsonResponse(200, { status: "no_token", messages: [] });
  }

  const tokenRow = tokenData as TokenRow;
  if (!hasOutlookMailScopes(tokenRow.scopes)) {
    return jsonResponse(200, {
      status: "needs_outlook_mail_scopes",
      messages: [],
    });
  }

  try {
    if (body.action === "list") {
      if (!body.contactEmail || typeof body.contactEmail !== "string") {
        return jsonResponse(400, { error: "missing contactEmail" });
      }
      const maxResults = Math.min(
        Math.max(body.maxResults ?? 20, 1),
        50,
      );
      const messages = await listMessagesForContact(
        adminClient,
        tokenRow,
        body.contactEmail,
        maxResults,
      );
      return jsonResponse(200, { status: "ok", messages });
    }

    if (body.action === "get") {
      if (!body.messageId || typeof body.messageId !== "string") {
        return jsonResponse(400, { error: "missing messageId" });
      }
      const message = await getMessageDetail(
        adminClient,
        tokenRow,
        body.messageId,
      );
      if (!message) {
        return jsonResponse(404, { status: "error", error: "message not found" });
      }
      return jsonResponse(200, { status: "ok", message });
    }

    if (!body.to || !body.subject || typeof body.body !== "string") {
      return jsonResponse(400, { error: "missing to, subject, or body" });
    }

    const messageId = await sendMessage(adminClient, tokenRow, {
      to: body.to.trim(),
      subject: body.subject.trim(),
      body: body.body,
    });
    return jsonResponse(200, { status: "ok", messageId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "needs_reconsent") {
      return jsonResponse(200, { status: "needs_reconsent" });
    }
    return jsonResponse(502, { status: "error", error: message });
  }
});
