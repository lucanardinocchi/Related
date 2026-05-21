// instagram-oauth Edge Function — exchange Instagram Login OAuth code for
// long-lived tokens and persist to user_provider_tokens.
//
// Deploy:
//   supabase secrets set INSTAGRAM_APP_ID=...
//   supabase secrets set INSTAGRAM_APP_SECRET=...
//   supabase functions deploy instagram-oauth
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const INSTAGRAM_GRAPH = "https://graph.instagram.com";
const INSTAGRAM_SCOPES =
  "instagram_business_basic,instagram_business_manage_messages";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const APP_ID = Deno.env.get("INSTAGRAM_APP_ID");
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

async function exchangeCodeForShortLivedToken(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; userId: string }> {
  const body = new URLSearchParams({
    client_id: APP_ID ?? "",
    client_secret: APP_SECRET ?? "",
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const response = await fetch(INSTAGRAM_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Instagram token exchange failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }

  const data = await response.json();
  if (!data.access_token || !data.user_id) {
    throw new Error("Instagram token exchange returned incomplete payload");
  }

  return {
    accessToken: data.access_token as string,
    userId: String(data.user_id),
  };
}

async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const url =
    `${INSTAGRAM_GRAPH}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(APP_SECRET ?? "")}&access_token=${encodeURIComponent(shortLivedToken)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Instagram long-lived exchange failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }
  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Instagram long-lived exchange returned no access_token");
  }
  return {
    accessToken: data.access_token as string,
    expiresInSeconds: data.expires_in ?? 60 * 24 * 60 * 60,
  };
}

async function fetchInstagramAccountId(
  accessToken: string,
): Promise<string> {
  const url =
    `${INSTAGRAM_GRAPH}/me?fields=user_id,username&access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Instagram /me failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }
  const data = await response.json();
  const accountId = data.user_id ?? data.id;
  if (!accountId) {
    throw new Error("Instagram /me returned no user_id");
  }
  return String(accountId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  if (!APP_ID || !APP_SECRET) {
    return jsonResponse(500, { error: "Instagram app credentials not configured" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "missing Authorization header" });
  }

  let body: { code?: string; redirectUri?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid JSON body" });
  }

  if (!body.code || !body.redirectUri) {
    return jsonResponse(400, { error: "missing code or redirectUri" });
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

  try {
    const short = await exchangeCodeForShortLivedToken(
      body.code,
      body.redirectUri,
    );
    const long = await exchangeForLongLivedToken(short.accessToken);
    const accountId = await fetchInstagramAccountId(long.accessToken);
    const expiresAt = new Date(
      Date.now() + long.expiresInSeconds * 1000,
    ).toISOString();

    const adminClient = createClient(
      SUPABASE_URL ?? "",
      SERVICE_ROLE_KEY ?? "",
      { auth: { persistSession: false } },
    );

    const { error: upsertError } = await adminClient
      .from("user_provider_tokens")
      .upsert(
        {
          owner_id: ownerId,
          provider: "instagram",
          access_token: long.accessToken,
          refresh_token: long.accessToken,
          expires_at: expiresAt,
          scopes: INSTAGRAM_SCOPES,
          provider_account_id: accountId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id,provider" },
      );

    if (upsertError) {
      return jsonResponse(500, { error: upsertError.message });
    }

    return jsonResponse(200, {
      status: "ok",
      username: short.userId,
      accountId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(502, { status: "error", error: message });
  }
});
