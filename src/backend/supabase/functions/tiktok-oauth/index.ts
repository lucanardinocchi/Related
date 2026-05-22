// tiktok-oauth Edge Function — exchange TikTok Login Kit code for tokens and
// persist to user_provider_tokens.
//
// Deploy:
//   supabase secrets set TIKTOK_CLIENT_KEY=...
//   supabase secrets set TIKTOK_CLIENT_SECRET=...
//   supabase functions deploy tiktok-oauth
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const USER_INFO_URL =
  "https://open.tiktokapis.com/v2/user/info/?fields=open_id,username,display_name";
const TIKTOK_SCOPES = "user.info.basic,user.info.profile";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CLIENT_KEY = Deno.env.get("TIKTOK_CLIENT_KEY");
const CLIENT_SECRET = Deno.env.get("TIKTOK_CLIENT_SECRET");

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

async function exchangeCodeForTokens(input: {
  code: string;
  redirectUri: string;
}): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
  openId: string;
  scopes: string;
}> {
  const body = new URLSearchParams({
    client_key: CLIENT_KEY ?? "",
    client_secret: CLIENT_SECRET ?? "",
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `TikTok token exchange failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(
      `TikTok token exchange error: ${data.error_description ?? data.error}`,
    );
  }
  if (!data.access_token) {
    throw new Error("TikTok token exchange returned no access_token");
  }

  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) ?? null,
    expiresInSeconds: data.expires_in ?? 86400,
    openId: data.open_id as string,
    scopes: (data.scope as string) ?? TIKTOK_SCOPES,
  };
}

async function fetchTikTokUsername(accessToken: string): Promise<string | null> {
  const response = await fetch(USER_INFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const data = await response.json();
  return (data.data?.user?.username as string) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  if (!CLIENT_KEY || !CLIENT_SECRET) {
    return jsonResponse(500, {
      error: "TikTok client credentials not configured",
    });
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
    const tokens = await exchangeCodeForTokens({
      code: body.code,
      redirectUri: body.redirectUri,
    });
    const username = await fetchTikTokUsername(tokens.accessToken);
    const expiresAt = new Date(
      Date.now() + tokens.expiresInSeconds * 1000,
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
          provider: "tiktok",
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          expires_at: expiresAt,
          scopes: tokens.scopes,
          provider_account_id: tokens.openId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id,provider" },
      );

    if (upsertError) {
      return jsonResponse(500, { error: upsertError.message });
    }

    return jsonResponse(200, {
      status: "ok",
      openId: tokens.openId,
      username,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(502, { status: "error", error: message });
  }
});
