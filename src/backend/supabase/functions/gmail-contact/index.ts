// gmail-contact Edge Function — list and send Gmail for a Contact email.
//
// Authenticates the User via JWT, reads their Google OAuth token from
// user_provider_tokens (service role), and proxies Gmail API calls.
// Token refresh on 401 mirrors sync-calendar.
//
// Deploy:
//   supabase secrets set GOOGLE_OAUTH_CLIENT_ID=...
//   supabase secrets set GOOGLE_OAUTH_CLIENT_SECRET=...
//   supabase functions deploy gmail-contact
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_MESSAGES_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

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

type GmailContactRequest = ListRequest | SendRequest | GetRequest;

interface GmailMessageSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  direction: "sent" | "received";
}

interface GmailMessageDetail {
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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

function hasGmailScopes(scopes: string | null): boolean {
  if (!scopes) return false;
  return scopes.includes(GMAIL_READONLY_SCOPE) && scopes.includes(GMAIL_SEND_SCOPE);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(`Google token refresh failed (${response.status})`);
  }
  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Google token refresh returned no access_token");
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
    .eq("provider", "google");
}

async function gmailFetch(
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

function headerValue(
  headers: Array<{ name?: string; value?: string }> | undefined,
  name: string,
): string {
  const found = (headers ?? []).find(
    (h) => h.name?.toLowerCase() === name.toLowerCase(),
  );
  return found?.value ?? "";
}

function encodeBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
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

function extractTextFromPayload(payload: {
  mimeType?: string;
  body?: { data?: string };
  parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }>;
} | undefined): string {
  if (!payload) return "";

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts?.length) {
    let plain = "";
    let html = "";
    for (const part of payload.parts) {
      const text = extractTextFromPayload(part as typeof payload);
      if (!text) continue;
      if (part.mimeType === "text/plain") {
        plain = text;
      } else if (part.mimeType === "text/html") {
        html = text;
      } else if (!plain && !html) {
        plain = text;
      }
    }
    return plain || html;
  }

  if (payload.mimeType === "text/html" && payload.body?.data) {
    return stripHtml(decodeBase64Url(payload.body.data));
  }

  return "";
}

function buildRawEmail(input: {
  to: string;
  subject: string;
  body: string;
}): string {
  const lines = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    input.body,
  ];
  return encodeBase64Url(lines.join("\r\n"));
}

async function withGoogleAccessToken(
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

async function listMessagesForContact(
  supabase: any,
  tokenRow: TokenRow,
  contactEmail: string,
  maxResults: number,
): Promise<GmailMessageSummary[]> {
  const normalized = normalizeEmail(contactEmail);
  const query = encodeURIComponent(
    `from:${normalized} OR to:${normalized}`,
  );
  const listUrl = `${GMAIL_MESSAGES_URL}?q=${query}&maxResults=${maxResults}`;

  const { response: listResponse } = await withGoogleAccessToken(
    supabase,
    tokenRow,
    (accessToken) => gmailFetch(listUrl, accessToken),
  );

  if (listResponse.status === 401) {
    throw new Error("needs_reconsent");
  }
  if (!listResponse.ok) {
    const text = await listResponse.text();
    throw new Error(`Gmail list failed (${listResponse.status}): ${text.slice(0, 200)}`);
  }

  const listData = await listResponse.json();
  const refs: Array<{ id: string; threadId?: string }> = listData.messages ?? [];
  if (refs.length === 0) return [];

  const summaries = await Promise.all(
    refs.map(async (ref) => {
      const detailUrl =
        `${GMAIL_MESSAGES_URL}/${ref.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`;
      const { response: detailResponse } = await withGoogleAccessToken(
        supabase,
        tokenRow,
        (accessToken) => gmailFetch(detailUrl, accessToken),
      );
      if (!detailResponse.ok) return null;

      const detail = await detailResponse.json();
      const from = headerValue(detail.payload?.headers, "From");
      const to = headerValue(detail.payload?.headers, "To");
      const subject = headerValue(detail.payload?.headers, "Subject");
      const date = headerValue(detail.payload?.headers, "Date");
      const fromNorm = from.toLowerCase();
      const toNorm = to.toLowerCase();
      const direction: "sent" | "received" = fromNorm.includes(normalized)
        ? "received"
        : toNorm.includes(normalized)
        ? "sent"
        : "received";

      return {
        id: detail.id as string,
        threadId: (detail.threadId as string) ?? ref.threadId ?? ref.id,
        subject: subject || "(no subject)",
        from,
        to,
        date: date || (detail.internalDate ?? ""),
        snippet: (detail.snippet as string) ?? "",
        direction,
      } satisfies GmailMessageSummary;
    }),
  );

  return summaries.filter((m): m is GmailMessageSummary => m !== null);
}

async function getMessageDetail(
  supabase: any,
  tokenRow: TokenRow,
  messageId: string,
): Promise<GmailMessageDetail | null> {
  const detailUrl = `${GMAIL_MESSAGES_URL}/${messageId}?format=full`;
  const { response: detailResponse } = await withGoogleAccessToken(
    supabase,
    tokenRow,
    (accessToken) => gmailFetch(detailUrl, accessToken),
  );

  if (detailResponse.status === 401) {
    throw new Error("needs_reconsent");
  }
  if (!detailResponse.ok) return null;

  const detail = await detailResponse.json();
  const from = headerValue(detail.payload?.headers, "From");
  const to = headerValue(detail.payload?.headers, "To");
  const subject = headerValue(detail.payload?.headers, "Subject");
  const date =
    headerValue(detail.payload?.headers, "Date") ||
    (detail.internalDate ?? "");
  const body = extractTextFromPayload(detail.payload).trim();

  return {
    id: detail.id as string,
    subject: subject || "(no subject)",
    from,
    to,
    date,
    body: body || (detail.snippet as string) || "",
  };
}

async function sendMessage(
  supabase: any,
  tokenRow: TokenRow,
  input: { to: string; subject: string; body: string },
): Promise<string> {
  const raw = buildRawEmail(input);
  const { response } = await withGoogleAccessToken(
    supabase,
    tokenRow,
    (accessToken) =>
      gmailFetch(GMAIL_SEND_URL, accessToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw }),
      }),
  );

  if (response.status === 401) {
    throw new Error("needs_reconsent");
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gmail send failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  return (data.id as string) ?? "";
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

  let body: GmailContactRequest;
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
    .eq("provider", "google")
    .maybeSingle();

  if (tokenError) {
    return jsonResponse(500, { status: "error", error: tokenError.message });
  }
  if (!tokenData) {
    return jsonResponse(200, { status: "no_token", messages: [] });
  }

  const tokenRow = tokenData as TokenRow;
  if (!hasGmailScopes(tokenRow.scopes)) {
    return jsonResponse(200, { status: "needs_gmail_scopes", messages: [] });
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
